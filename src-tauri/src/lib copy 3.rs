#[cfg_attr(mobile, tauri::mobile_entry_point)]

use tauri::{Emitter, Manager, RunEvent};

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let cli_file_arg = args.get(1).cloned();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            println!("========== SINGLE INSTANCE (CLI / Windows / Linux) ==========");
            println!("argv = {:?}", argv);

            // Sur Windows/Linux, le fichier passe par argv
            if let Some(path) = argv.get(1) {
                println!("OPEN FILE = {}", path);
                let _ = app.emit("open-file", path.clone());
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(move |app| {
            println!("========== SETUP ==========");

            // Traitement CLI standard
            if let Some(path) = cli_file_arg {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(5000)).await;
                    let _ = handle.emit("open-file", path);
                });
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

    // Événement exécuté à la fois au démarrage ET au runtime sous macOS
    app.run(|app_handle, event| {
        if let RunEvent::Opened { urls } = event {
            println!("========== MACOS RUN EVENT OPENED ==========");

            for url in urls {
                println!("URL reçue : {:?}", url);

                // Conversion de l'URL macOS (file://...) en chemin de fichier standard
                let path_str = if let Ok(path) = url.to_file_path() {
                    path.to_string_lossy().to_string()
                } else {
                    url.path().to_string()
                };

                println!("FICHIER OUVERT SUR MACOS : {}", path_str);

                // Émission de l'événement au frontend
                let _ = app_handle.emit("open-file", path_str);

                // Focus sur la fenêtre principale
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        }
    });
}