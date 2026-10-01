// MEDORA de escritorio (Linux y macOS) con Tauri. Carga la misma app web de
// MEDORA (app/dist) en una ventana nativa; toda la lógica vive en Supabase.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error al iniciar MEDORA");
}
