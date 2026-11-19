use js_sys::{SharedArrayBuffer, Uint8Array};
use wasm_bindgen::prelude::*;
use wasm_encoder::{
    CodeSection, ExportKind, ExportSection, Function, FunctionSection, ImportSection, Instruction,
    Module, TypeSection, ValType,
};

pub const PAGE_SIZE: usize = 65_536; // 64 KiB por página
pub const DEFAULT_TOTAL_PAGES: u32 = 4_096; // 256 MiB total (128 MiB RAM + 128 MiB Swap)
pub const MAX_TOTAL_PAGES: u32 = 8_192; // 512 MiB teto seguro para iPadOS

#[wasm_bindgen]
pub struct InkSoC {
    total_pages: u32,
    active_ram_pages: u32,
    swap_pages: u32,
    buffer: Option<SharedArrayBuffer>,
}

#[wasm_bindgen]
impl InkSoC {
    /// Cria o SoC com memória fixa (em páginas de 64 KiB), dividida 50% RAM ativa / 50% Swap fixo.
    #[wasm_bindgen(constructor)]
    pub fn new(requested_total_pages: u32) -> Result<InkSoC, JsValue> {
        let mut total = if requested_total_pages == 0 {
            DEFAULT_TOTAL_PAGES
        } else {
            requested_total_pages.min(MAX_TOTAL_PAGES)
        };

        // Garante divisão par (50% RAM / 50% Swap)
        if total < 2 {
            total = 2;
        }
        if total % 2 != 0 {
            total -= 1;
        }

        let half = total / 2;
        Ok(InkSoC {
            total_pages: total,
            active_ram_pages: half,
            swap_pages: half,
            buffer: None,
        })
    }

    pub fn page_size(&self) -> usize {
        PAGE_SIZE
    }

    pub fn total_pages(&self) -> u32 {
        self.total_pages
    }

    pub fn active_ram_pages(&self) -> u32 {
        self.active_ram_pages
    }

    pub fn swap_pages(&self) -> u32 {
        self.swap_pages
    }

    pub fn total_pool_bytes(&self) -> usize {
        (self.total_pages as usize) * PAGE_SIZE
    }

    pub fn active_ram_bytes(&self) -> usize {
        (self.active_ram_pages as usize) * PAGE_SIZE
    }

    pub fn swap_bytes(&self) -> usize {
        (self.swap_pages as usize) * PAGE_SIZE
    }

    /// Endereço virtual 64-bit da página `vpage`
    pub fn virt_addr_64(&self, vpage: u64, offset_in_page: u64) -> u64 {
        let page_off = vpage.saturating_mul(PAGE_SIZE as u64);
        let clamped_off = offset_in_page.min((PAGE_SIZE as u64) - 1);
        page_off.saturating_add(clamped_off)
    }

    /// Offset em bytes no pool compartilhado para uma página física de RAM ativa (0..active_ram_pages)
    pub fn ram_page_offset_64(&self, ram_page: u32) -> Result<u64, JsValue> {
        if ram_page >= self.active_ram_pages {
            return Err(JsValue::from_str("ram_page out of active RAM pool"));
        }
        Ok((ram_page as u64) * (PAGE_SIZE as u64))
    }

    /// Offset em bytes no pool compartilhado para um slot de Swap fixo (0..swap_pages)
    pub fn swap_slot_offset_64(&self, swap_slot: u32) -> Result<u64, JsValue> {
        if swap_slot >= self.swap_pages {
            return Err(JsValue::from_str("swap_slot out of fixed swap pool"));
        }
        let base = (self.active_ram_pages as u64) * (PAGE_SIZE as u64);
        Ok(base + (swap_slot as u64) * (PAGE_SIZE as u64))
    }

    pub fn bind_shared_memory(&mut self, buffer: SharedArrayBuffer) -> Result<(), JsValue> {
        if (buffer.byte_length() as usize) < self.total_pool_bytes() {
            return Err(JsValue::from_str(
                "SharedArrayBuffer smaller than fixed total pool (RAM + Swap)",
            ));
        }
        self.buffer = Some(buffer);
        Ok(())
    }

    fn write_page_at_offset(&self, offset_bytes: u64, data: &Uint8Array) -> Result<usize, JsValue> {
        if (data.length() as usize) != PAGE_SIZE {
            return Err(JsValue::from_str("page must be exactly 64 KiB"));
        }
        let buffer = self
            .buffer
            .as_ref()
            .ok_or_else(|| JsValue::from_str("shared pool not bound"))?;

        let off_usize = usize::try_from(offset_bytes)
            .map_err(|_| JsValue::from_str("offset overflows usize"))?;
        let off_u32 = u32::try_from(offset_bytes)
            .map_err(|_| JsValue::from_str("offset overflows u32"))?;

        if off_usize + PAGE_SIZE > (buffer.byte_length() as usize) {
            return Err(JsValue::from_str("page write exceeds shared pool bounds"));
        }

        Uint8Array::new(buffer).set(data, off_u32);
        Ok(PAGE_SIZE)
    }

    pub fn write_ram_page(&self, ram_page: u32, data: &Uint8Array) -> Result<usize, JsValue> {
        let off = self.ram_page_offset_64(ram_page)?;
        self.write_page_at_offset(off, data)
    }

    pub fn write_swap_slot(&self, swap_slot: u32, data: &Uint8Array) -> Result<usize, JsValue> {
        let off = self.swap_slot_offset_64(swap_slot)?;
        self.write_page_at_offset(off, data)
    }

    /// Emite módulo Wasm de shell 64-bit (assinaturas i64) com seção de imports explícita
    pub fn emit_wasi_module(&self) -> Result<Vec<u8>, JsValue> {
        let mut module = Module::new();

        let mut types = TypeSection::new();
        // type 0: syscall 64-bit (i64, i64, i64, i64) -> i64
        types.ty().function(
            [ValType::I64, ValType::I64, ValType::I64, ValType::I64],
            [ValType::I64],
        );
        // type 1: _start () -> ()
        types.ty().function([], []);
        module.section(&types);

        let imports = ImportSection::new();
        module.section(&imports);

        let mut functions = FunctionSection::new();
        functions.function(1);
        module.section(&functions);

        let mut exports = ExportSection::new();
        exports.export("_start", ExportKind::Func, 0);
        module.section(&exports);

        let mut code = CodeSection::new();
        let mut func = Function::new([]);
        func.instruction(&Instruction::Nop);
        func.instruction(&Instruction::End);
        code.function(&func);
        module.section(&code);

        Ok(module.finish())
    }
}
