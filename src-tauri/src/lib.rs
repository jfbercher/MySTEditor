#[cfg_attr(mobile, tauri::mobile_entry_point)]

use std::sync::Mutex;
use tauri::{Emitter, Manager, RunEvent, State};

#[derive(Default)]
pub struct PendingFile(pub Mutex<Option<String>>);

#[tauri::command]
fn get_pending_file(state: State<'_, PendingFile>) -> Option<String> {
    let mut pending = state.0.lock().unwrap();
    pending.take()
}

pub fn run() {
    // 1. Récupération de l'argument en ligne de commande au lancement
    let args: Vec<String> = std::env::args().collect();
    let cli_file_arg = args.get(1).cloned();

    let app = tauri::Builder::default()
        .manage(PendingFile::default())
        .invoke_handler(tauri::generate_handler![get_pending_file])
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            println!("========== SINGLE INSTANCE (CLI) ==========");
            // Pour Windows/Linux ou instance secondaire CLI
            if let Some(path) = argv.get(1) {
                let _ = app.emit("open-file", path.clone());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(move |app| {
            // 2. Si un fichier est passé en CLI lors du premier démarrage
            if let Some(path) = cli_file_arg {
                // S'assurer qu'il ne s'agit pas d'un flag comme "--debug"
                if !path.starts_with('-') {
                    if let Some(state) = app.try_state::<PendingFile>() {
                        *state.0.lock().unwrap() = Some(path);
                    }
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Opened { urls } = event {
            for url in urls {
                let path_str = if let Ok(path) = url.to_file_path() {
                    path.to_string_lossy().to_string()
                } else {
                    url.path().to_string()
                };

                // Événement macOS (Finder / Ouvrir avec)
                if let Some(state) = app_handle.try_state::<PendingFile>() {
                    *state.0.lock().unwrap() = Some(path_str.clone());
                }

                let _ = app_handle.emit("open-file", path_str);

                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        }
    });
}