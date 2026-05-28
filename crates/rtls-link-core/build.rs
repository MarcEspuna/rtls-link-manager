use std::env;
use std::path::PathBuf;

use mavlink_bindgen::XmlDefinitions;

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let definitions_dir = manifest_dir.join("mavlink/message_definitions");
    let rtlslink_xml = definitions_dir.join("rtlslink.xml");
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("out dir"));

    let result = mavlink_bindgen::generate(XmlDefinitions::Files(vec![rtlslink_xml]), out_dir)
        .expect("generate RTLS-Link MAVLink bindings");

    mavlink_bindgen::format_generated_code(&result);
    mavlink_bindgen::emit_cargo_build_messages(&result);
    println!(
        "cargo:rerun-if-changed={}",
        definitions_dir.join("minimal.xml").display()
    );
}
