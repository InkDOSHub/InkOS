use js_sys::{SharedArrayBuffer, Uint8Array};
use wasm_bindgen::prelude::*;
use wasm_encoder::{
    CodeSection, ExportKind, ExportSection, Function, FunctionSection, Instruction, Module,
    TypeSection, ValType,
};

pub const PAGE_SIZE: usize = 65_536;
pub const DEFAULT_RAM_PAGES: u32 = 8_192; // 512 MiB
pub const MAX_RAM_PAGES: u32 = 16_384;    // 1 GiB (teto seguro para iOS Jetsam)

#[wasm_bindgen]
pub struct InkSoC {
    ram_pages: u32,
    buffer: Option<SharedArrayBuffer>,
}

#[wasm_bindgen]
impl InkSoC {
    #[wasm_bindgen(constructor)]
    pub fn new(requested_pages: u32) -> Result<InkSoC, JsValue> {
        let pages = if requested_pages == 0 {
            DEFAULT_RAM_PAGES
        } else {
            requested_pages.min(MAX_RAM_PAGES)
        };
        Ok(InkSoC {
            ram_pages: pages,
            buffer: None,
        })
    }

    pub fn ram_bytes(&self) -> usize {
        (self.ram_pages as usize) * PAGE_SIZE
    }

    pub fn bind_shared_memory(&mut self, buffer: SharedArrayBuffer) -> Result<(), JsValue> {
        if (buffer.byte_length() as usize) < self.ram_bytes() {
            return Err(JsValue::from_str("SharedArrayBuffer smaller than configured physical RAM"));
        }
        self.buffer = Some(buffer);
        Ok(())
    }

    fn page_offset(page: u32) -> Result<u64, JsValue> {
        Ok((page as u64) * (PAGE_SIZE as u64))
    }

    pub fn copy_page(&self, page: u32, data: &Uint8Array) -> Result<usize, JsValue> {
        let offset = Self::page_offset(page)? as usize;
        if data.length() as usize != PAGE_SIZE {
            return Err(JsValue::from_str("page must be exactly 64 KiB"));
        }
        let buffer = self
            .buffer
            .as_ref()
            .ok_or_else(|| JsValue::from_str("memory not mapped"))?;
        if offset + PAGE_SIZE > buffer.byte_length() as usize {
            return Err(JsValue::from_str("page out of RAM"));
        }
        Uint8Array::new(buffer).set(data, offset as u32);
        Ok(PAGE_SIZE)
    }

    pub fn emit_wasi_module(&self) -> Result<Vec<u8>, JsValue> {
        let mut module = Module::new();

        let mut types = TypeSection::new();
        types
            .ty()
            .function([ValType::I32, ValType::I32, ValType::I32, ValType::I32], [ValType::I32]);
        types.ty().function([], []);
        module.section(&types);

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
