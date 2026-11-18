use js_sys::{ArrayBuffer, Uint8Array};
use wasm_bindgen::prelude::*;
use wasm_encoder::{CodeSection, ExportKind, ExportSection, Function, FunctionSection, Instruction, Module, TypeSection, ValType};

pub const DEFAULT_RAM: usize = 512 * 1024 * 1024;
pub const MAX_RAM: usize = 1024 * 1024 * 1024;
pub const PAGE_SIZE: usize = 64 * 1024;

#[derive(Clone, Copy)]
pub struct PageMap {
    pub resident: bool,
    pub dirty: bool,
}

#[wasm_bindgen]
pub struct InkSoc {
    buffer: Option<ArrayBuffer>,
    pages: Vec<PageMap>,
}

#[wasm_bindgen]
impl InkSoc {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Result<InkSoc, JsValue> {
        Ok(InkSoc { buffer: None, pages: vec![PageMap { resident: false, dirty: false }; DEFAULT_RAM / PAGE_SIZE] })
    }

    pub fn map_memory(&mut self, buffer: ArrayBuffer) -> Result<usize, JsValue> {
        let bytes = buffer.byte_length() as usize;
        if bytes < DEFAULT_RAM { return Err(JsValue::from_str("InkSoC RAM is below 512 MiB")); }
        if bytes > MAX_RAM { return Err(JsValue::from_str("InkSoC RAM exceeds 1 GiB")); }
        if bytes % PAGE_SIZE != 0 { return Err(JsValue::from_str("InkSoC RAM is not 64 KiB aligned")); }
        self.buffer = Some(buffer);
        self.pages = vec![PageMap { resident: false, dirty: false }; bytes / PAGE_SIZE];
        Ok(bytes)
    }

    pub fn page_count(&self) -> usize { self.pages.len() }

    pub fn touch_page(&mut self, page: u32, dirty: bool) -> Result<u32, JsValue> {
        let index = page as usize;
        if index >= self.pages.len() { return Err(JsValue::from_str("physical page out of range")); }
        self.pages[index].resident = true;
        self.pages[index].dirty |= dirty;
        Ok(page)
    }

    pub fn page_offset(page: u32) -> Result<u32, JsValue> {
        Ok(page.checked_mul(PAGE_SIZE as u32).ok_or_else(|| JsValue::from_str("page offset overflow"))?)
    }

    pub fn copy_page(&self, page: u32, data: &Uint8Array) -> Result<usize, JsValue> {
        let offset = Self::page_offset(page)? as usize;
        if data.length() as usize != PAGE_SIZE { return Err(JsValue::from_str("page must be exactly 64 KiB")); }
        let buffer = self.buffer.as_ref().ok_or_else(|| JsValue::from_str("memory not mapped"))?;
        if offset + PAGE_SIZE > buffer.byte_length() as usize { return Err(JsValue::from_str("page out of RAM")); }
Uint8Array::new(buffer).set(data, offset as u32);
        Ok(PAGE_SIZE)
    }

    pub fn emit_wasi_module(&self) -> Result<Vec<u8>, JsValue> {
        let mut module = Module::new();
        let mut types = TypeSection::new();
        types.ty().function([ValType::I32, ValType::I32, ValType::I32, ValType::I32], [ValType::I32]);
        types.ty().function([], []);
        module.section(&types);

        let mut functions = FunctionSection::new();
        functions.function(1);
        module.section(&functions);

        let mut exports = ExportSection::new();
        exports.export("_start", ExportKind::Func, 0);
        module.section(&exports);

        let mut code = CodeSection::new();
        code.function(&Function::new([]).with_return(Instruction::Nop));
        module.section(&code);
        Ok(module.finish())
    }
}

#[wasm_bindgen]
pub fn default_ram_bytes() -> u32 { DEFAULT_RAM as u32 }

#[wasm_bindgen]
pub fn max_ram_bytes() -> u32 { MAX_RAM as u32 }

#[wasm_bindgen]
pub fn page_size_bytes() -> u32 { PAGE_SIZE as u32 }
