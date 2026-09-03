#[cfg_attr(mobile, tauri::mobile_entry_point)]

use tauri::{Emitter, Manager, RunEvent};

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let cli_file_arg = args.get(1).cloned();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
                println!("========== SINGLE INSTANCE ==========");
    println!("argv = {:?}", argv);
    println!("cwd = {:?}", _cwd);
            if let Some(path) = argv.get(1) {
                let _ = app.emit("open-file", path.clone());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .setup(move |app| {
            println!("========== SETUP ==========");

            if let Some(path) = cli_file_arg.clone() {
                println!("========== SETUP FILE ==========");
                println!("path = {}", path);

                let handle = app.handle().clone();

                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(
                        std::time::Duration::from_millis(1500)
                    ).await;

                    println!("========== EMIT OPEN-FILE ==========");
                    println!("path = {}", path);

                    let result = handle.emit("open-file", path);

                    println!("emit result = {:?}", result);
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}