use std::path::Path;

fn main() {
    tauri_build::build();

    // Conditionally copy e2e-testing capability into capabilities/ 
    // Cargo sets CARGO_FEATURE_<NAME> env vars for enabled features (hyphens become underscores)
    if std::env::var("CARGO_FEATURE_E2E_TESTING").is_ok() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let e2e_cap_src = Path::new(manifest_dir).join("capabilities-e2e/e2e-testing.json");
        let cap_dest = Path::new(manifest_dir).join("capabilities/e2e-testing.json");

        if e2e_cap_src.exists() {
            std::fs::copy(&e2e_cap_src, &cap_dest).expect("Failed to copy e2e capability");
            println!("cargo:rerun-if-changed=capabilities-e2e/e2e-testing.json");
        }
    }
}
