//! Arena-by-handle paging with CLOCK eviction (see docs/adr/ADR-swap.md).
//!
//! Pure Rust, no wasm-bindgen: unit-tested natively with `cargo test`.
//! The pager only decides *which* page lives in *which* frame; moving bytes
//! between the shared pool and the OPFS swap file is the swap worker's job.

use std::collections::HashMap;

pub const PAGE_SIZE: u32 = 65_536;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Location {
    Resident(u32),
    Swapped(u32),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    /// Page already resident in `frame`.
    Hit { frame: u32 },
    /// Page placed in a free `frame`; zero it (first touch) or load `from_slot`.
    Load { frame: u32, from_slot: Option<u32> },
    /// `victim` page must be written from `frame` to `to_slot`, then the
    /// requested page loaded into the same frame (from `from_slot` if any).
    EvictThenLoad { frame: u32, victim: u64, to_slot: u32, from_slot: Option<u32> },
}

#[derive(Debug, PartialEq, Eq)]
pub enum PagerError {
    SwapFull,
    NoFrames,
}

#[derive(Debug)]
pub struct Pager {
    frames: Vec<Option<u64>>, // frame -> resident vpage
    referenced: Vec<bool>,
    hand: usize,
    table: HashMap<u64, Location>,
    free_slots: Vec<u32>,
    next_slot: u32,
    max_slots: u32,
    pub stats: Stats,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Stats {
    pub hits: u64,
    pub faults: u64,
    pub evictions: u64,
}

impl Pager {
    /// `frames`: resident budget in pages. `max_slots`: swap file cap in pages.
    pub fn new(frames: u32, max_slots: u32) -> Self {
        Pager {
            frames: vec![None; frames as usize],
            referenced: vec![false; frames as usize],
            hand: 0,
            table: HashMap::new(),
            free_slots: Vec::new(),
            next_slot: 0,
            max_slots,
            stats: Stats::default(),
        }
    }

    pub fn frame_count(&self) -> u32 {
        self.frames.len() as u32
    }

    pub fn resident_count(&self) -> u32 {
        self.frames.iter().filter(|f| f.is_some()).count() as u32
    }

    pub fn swapped_count(&self) -> u32 {
        self.table.values().filter(|l| matches!(l, Location::Swapped(_))).count() as u32
    }

    pub fn location(&self, vpage: u64) -> Option<Location> {
        self.table.get(&vpage).copied()
    }

    fn alloc_slot(&mut self) -> Result<u32, PagerError> {
        if let Some(s) = self.free_slots.pop() {
            return Ok(s);
        }
        if self.next_slot >= self.max_slots {
            return Err(PagerError::SwapFull);
        }
        self.next_slot += 1;
        Ok(self.next_slot - 1)
    }

    /// Swap file high-water mark in pages (file length = this * PAGE_SIZE).
    pub fn swap_high_water(&self) -> u32 {
        self.next_slot
    }

    fn clock_victim(&mut self) -> usize {
        loop {
            let i = self.hand;
            self.hand = (self.hand + 1) % self.frames.len();
            if self.referenced[i] {
                self.referenced[i] = false;
            } else {
                return i;
            }
        }
    }

    /// Ensure `vpage` is resident and say what data movement is needed.
    pub fn access(&mut self, vpage: u64) -> Result<Action, PagerError> {
        if self.frames.is_empty() {
            return Err(PagerError::NoFrames);
        }
        let from_slot = match self.table.get(&vpage) {
            Some(Location::Resident(f)) => {
                let f = *f;
                self.referenced[f as usize] = true;
                self.stats.hits += 1;
                return Ok(Action::Hit { frame: f });
            }
            Some(Location::Swapped(s)) => Some(*s),
            None => None,
        };
        self.stats.faults += 1;

        if let Some(free) = self.frames.iter().position(|f| f.is_none()) {
            self.install(vpage, free, from_slot);
            return Ok(Action::Load { frame: free as u32, from_slot });
        }

        let frame = self.clock_victim();
        let victim = self.frames[frame].expect("full frames");
        let to_slot = self.alloc_slot()?;
        self.table.insert(victim, Location::Swapped(to_slot));
        self.stats.evictions += 1;
        self.install(vpage, frame, from_slot);
        Ok(Action::EvictThenLoad { frame: frame as u32, victim, to_slot, from_slot })
    }

    fn install(&mut self, vpage: u64, frame: usize, from_slot: Option<u32>) {
        if let Some(s) = from_slot {
            self.free_slots.push(s); // page now lives in RAM; slot reusable
        }
        self.frames[frame] = Some(vpage);
        self.referenced[frame] = true;
        self.table.insert(vpage, Location::Resident(frame as u32));
    }

    /// Drop a page entirely (arena freed by its owner).
    pub fn release(&mut self, vpage: u64) {
        match self.table.remove(&vpage) {
            Some(Location::Resident(f)) => {
                self.frames[f as usize] = None;
                self.referenced[f as usize] = false;
            }
            Some(Location::Swapped(s)) => self.free_slots.push(s),
            None => {}
        }
    }

    /// Session lock/close: forget everything; the worker truncates the file.
    pub fn reset(&mut self) {
        let n = self.frames.len();
        *self = Pager::new(n as u32, self.max_slots);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Simulates RAM frames + swap file with real bytes to check data integrity.
    struct Sim {
        pager: Pager,
        ram: Vec<Vec<u8>>,
        swap: HashMap<u32, Vec<u8>>,
        truth: HashMap<u64, u8>,
    }

    impl Sim {
        fn new(frames: u32, slots: u32) -> Self {
            Sim { pager: Pager::new(frames, slots), ram: vec![vec![0; 16]; frames as usize], swap: HashMap::new(), truth: HashMap::new() }
        }
        fn touch(&mut self, vpage: u64) -> Result<usize, PagerError> {
            let frame = match self.pager.access(vpage)? {
                Action::Hit { frame } => frame,
                Action::Load { frame, from_slot } => {
                    self.ram[frame as usize] = from_slot.map(|s| self.swap.remove(&s).unwrap()).unwrap_or(vec![0; 16]);
                    frame
                }
                Action::EvictThenLoad { frame, to_slot, from_slot, .. } => {
                    let out = std::mem::take(&mut self.ram[frame as usize]);
                    let incoming = from_slot.map(|s| self.swap.remove(&s).unwrap()).unwrap_or(vec![0; 16]);
                    self.swap.insert(to_slot, out);
                    self.ram[frame as usize] = incoming;
                    frame
                }
            };
            Ok(frame as usize)
        }
        fn write(&mut self, vpage: u64, v: u8) {
            let f = self.touch(vpage).unwrap();
            self.ram[f].fill(v);
            self.truth.insert(vpage, v);
        }
        fn check(&mut self, vpage: u64) {
            let f = self.touch(vpage).unwrap();
            let want = *self.truth.get(&vpage).unwrap_or(&0);
            assert!(self.ram[f].iter().all(|&b| b == want), "page {vpage} corrupted");
        }
    }

    #[test]
    fn first_touch_uses_free_frames() {
        let mut p = Pager::new(2, 8);
        assert_eq!(p.access(10), Ok(Action::Load { frame: 0, from_slot: None }));
        assert_eq!(p.access(11), Ok(Action::Load { frame: 1, from_slot: None }));
        assert_eq!(p.access(10), Ok(Action::Hit { frame: 0 }));
        assert_eq!(p.stats, Stats { hits: 1, faults: 2, evictions: 0 });
    }

    #[test]
    fn clock_gives_second_chance() {
        let mut p = Pager::new(3, 8);
        for v in 1..=3 {
            p.access(v).unwrap();
        }
        // all referenced: the hand clears every bit, then evicts frame 0 (page 1)
        match p.access(4).unwrap() {
            Action::EvictThenLoad { victim, frame, .. } => assert_eq!((victim, frame), (1, 0)),
            a => panic!("{a:?}"),
        }
        p.access(2).unwrap(); // second chance for page 2
        match p.access(5).unwrap() {
            Action::EvictThenLoad { victim, .. } => assert_eq!(victim, 3, "referenced page 2 must survive"),
            a => panic!("{a:?}"),
        }
        assert_eq!(p.location(2), Some(Location::Resident(1)));
    }

    #[test]
    fn swap_slots_are_reused_and_capped() {
        let mut p = Pager::new(1, 2);
        p.access(1).unwrap();
        p.access(2).unwrap(); // 1 -> slot 0
        p.access(3).unwrap(); // 2 -> slot 1
        assert_eq!(p.access(4), Err(PagerError::SwapFull));
        let mut q = Pager::new(1, 2);
        q.access(1).unwrap();
        q.access(2).unwrap(); // 1 -> slot 0
        q.access(1).unwrap(); // 2 -> slot 1, 1 back in RAM, slot 0 freed
        q.access(2).unwrap(); // 1 -> slot 0 (reused), slot 1 freed
        assert_eq!(q.swap_high_water(), 2);
        assert_eq!(q.swapped_count(), 1);
    }

    #[test]
    fn release_and_reset() {
        let mut p = Pager::new(2, 4);
        p.access(1).unwrap();
        p.access(2).unwrap();
        p.access(3).unwrap();
        p.release(1);
        p.release(3);
        assert_eq!(p.location(1), None);
        p.reset();
        assert_eq!(p.resident_count(), 0);
        assert_eq!(p.swap_high_water(), 0);
    }

    #[test]
    fn integrity_after_forced_eviction() {
        let mut s = Sim::new(4, 64);
        for v in 0..32u64 {
            s.write(v, (v as u8).wrapping_mul(7).wrapping_add(1));
        }
        for v in (0..32u64).rev() {
            s.check(v);
        }
        assert!(s.pager.stats.evictions > 0);
        assert!(s.pager.resident_count() <= 4);
    }

    #[test]
    fn stress_100k_random_accesses_stay_under_budget() {
        let mut s = Sim::new(64, 1024);
        let mut x: u64 = 0x9e3779b97f4a7c15;
        for i in 0..100_000u64 {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            let vpage = x % 512;
            if i % 3 == 0 {
                s.write(vpage, (x >> 32) as u8);
            } else {
                s.check(vpage);
            }
            assert!(s.pager.resident_count() <= 64);
        }
        for v in 0..512u64 {
            if s.truth.contains_key(&v) {
                s.check(v);
            }
        }
        assert!(s.pager.swap_high_water() <= 512);
    }
}
