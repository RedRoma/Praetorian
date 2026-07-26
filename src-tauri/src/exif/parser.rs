use anyhow::Result;
use image::ImageReader;

/// Parsed EXIF metadata from an image file.
#[derive(Debug, Clone, Default)]
pub struct ExifData {
    // Dimensions
    pub width: Option<u32>,
    pub height: Option<u32>,

    // Camera
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub software: Option<String>,

    // Exposure
    pub iso: Option<u32>,
    pub aperture: Option<f64>,
    pub shutter_num: Option<u32>,
    pub shutter_den: Option<u32>,
    pub focal_length: Option<f64>,
    pub flash_fired: Option<bool>,
    pub exposure_mode: Option<String>,
    pub white_balance: Option<String>,

    // Date/time
    pub date_time_original: Option<String>,

    // GPS
    pub gps_latitude: Option<f64>,
    pub gps_longitude: Option<f64>,
    pub gps_altitude: Option<f64>,
    pub gps_date_time: Option<String>,

    // Image info
    pub orientation: Option<u32>,
    pub bits_per_sample: Option<u32>,
    pub color_space: Option<String>,
}

pub struct ExifParser;

impl ExifParser {
    pub fn new() -> Self {
        Self
    }

    /// Parses EXIF data from an image file.
    /// Uses kamadak-exif for robust EXIF parsing across formats.
    /// Falls back to exiftool CLI if available and needed.
    pub fn parse(&self, path: &str) -> Result<ExifData> {
        let mut data = ExifData::default();

        // Try kamadak-exif first (most robust for JPEG/standard formats)
        if let Ok(file_data) = std::fs::read(path) {
            let mut cursor = std::io::Cursor::new(file_data);
            if let Ok(exif) = exif::Reader::new().read_from_container(&mut cursor) {
                data = self.extract_exif_data(&exif);
            }
        }

        // Try image crate for dimensions if not obtained from EXIF
        if data.width.is_none() || data.height.is_none() {
            if let Ok(img) = ImageReader::open(path) {
                if let Ok(img) = img.with_guessed_format() {
                    if let Ok((w, h)) = img.into_dimensions() {
                        data.width = Some(w);
                        data.height = Some(h);
                    }
                }
            }
        }

        // For RAW formats or missing metadata, try exiftool as fallback
        if data.camera_model.is_none() && data.date_time_original.is_none() {
            if let Ok(tool_data) = self.parse_with_exiftool(path) {
                data = tool_data;
            }
        }

        Ok(data)
    }

    /// Extracts structured EXIF data from a parsed exif::Exif instance.
    fn extract_exif_data(&self, exif: &exif::Exif) -> ExifData {
        let mut data = ExifData::default();

        for field in exif.fields() {
            match field.ifd_num {
                exif::In::PRIMARY => {
                    match field.tag {
                        exif::Tag::Make => {
                            data.camera_make = Some(field.display_value().to_string());
                        }
                        exif::Tag::Model => {
                            data.camera_model = Some(field.display_value().to_string());
                        }
                        exif::Tag::DateTimeOriginal => {
                            data.date_time_original = Some(field.display_value().to_string());
                        }
                        exif::Tag::Software => {
                            data.software = Some(field.display_value().to_string());
                        }
                        exif::Tag::Orientation => {
                            data.orientation = field.value.get_uint(0);
                        }
                        exif::Tag::BitsPerSample => {
                            data.bits_per_sample = field.value.get_uint(0);
                        }
                        _ => {}
                    }
                }
                _ => {}
            }

            // Exif IFD fields (identified by tag context)
            if field.tag.context() == exif::Context::Exif {
                match field.tag {
                    exif::Tag::ISOSpeed => {
                        data.iso = field.value.get_uint(0);
                    }
                    exif::Tag::FNumber => {
                        data.aperture = match &field.value {
                            exif::Value::Rational(v) if !v.is_empty() => Some(v[0].to_f64()),
                            exif::Value::SRational(v) if !v.is_empty() => Some(v[0].to_f64()),
                            _ => field.value.get_uint(0).map(|u| u as f64),
                        };
                    }
                    exif::Tag::ExposureTime => {
                        if let exif::Value::Rational(v) = &field.value {
                            if !v.is_empty() {
                                data.shutter_num = Some(v[0].num as u32);
                                data.shutter_den = Some(v[0].denom as u32);
                            }
                        }
                    }
                    exif::Tag::FocalLength => {
                        data.focal_length = match &field.value {
                            exif::Value::Rational(v) if !v.is_empty() => Some(v[0].to_f64()),
                            exif::Value::SRational(v) if !v.is_empty() => Some(v[0].to_f64()),
                            _ => field.value.get_uint(0).map(|u| u as f64),
                        };
                    }
                    exif::Tag::Flash => {
                        data.flash_fired = field.value.get_uint(0).map(|v| v & 1 != 0);
                    }
                    exif::Tag::ExposureProgram => {
                        data.exposure_mode = Some(field.display_value().to_string());
                    }
                    exif::Tag::WhiteBalance => {
                        data.white_balance = Some(field.display_value().to_string());
                    }
                    exif::Tag::LensMake => {}
                    exif::Tag::LensModel => {
                        data.lens_model = Some(field.display_value().to_string());
                    }
                    exif::Tag::ColorSpace => {
                        data.color_space = Some(field.display_value().to_string());
                    }
                    _ => {}
                }
            }

            // GPS IFD fields
            if field.tag.context() == exif::Context::Gps {
                match field.tag {
                    exif::Tag::GPSLatitude => {
                        data.gps_latitude = self.parse_gps_coordinate(&field.value);
                    }
                    exif::Tag::GPSLongitude => {
                        data.gps_longitude = self.parse_gps_coordinate(&field.value);
                    }
                    exif::Tag::GPSAltitude => {
                        data.gps_altitude = match &field.value {
                            exif::Value::Rational(v) if !v.is_empty() => Some(v[0].to_f64()),
                            exif::Value::SRational(v) if !v.is_empty() => Some(v[0].to_f64()),
                            _ => field.value.get_uint(0).map(|u| u as f64),
                        };
                    }
                    exif::Tag::GPSDateStamp => {
                        data.gps_date_time = Some(field.display_value().to_string());
                    }
                    _ => {}
                }
            }
        }

        data
    }

    fn parse_gps_coordinate(&self, value: &exif::Value) -> Option<f64> {
        match value {
            exif::Value::Rational(v) if !v.is_empty() => Some(v[0].to_f64()),
            exif::Value::SRational(v) if !v.is_empty() => Some(v[0].to_f64()),
            _ => value.get_uint(0).map(|u| u as f64),
        }
    }

    /// Fallback: uses exiftool CLI if available on the system.
    fn parse_with_exiftool(&self, path: &str) -> Result<ExifData> {
        let start = std::time::Instant::now();
        log::info!("[EXIF] Falling back to exiftool for: {}", path);
        let output = std::process::Command::new("exiftool")
            .args(["-json", path])
            .output()?;
        let elapsed = start.elapsed();
        log::info!("[EXIF] exiftool completed in {:.2}s for: {}", elapsed.as_secs_f64(), path);

        if !output.status.success() {
            return Err(anyhow::anyhow!("exiftool failed"));
        }

        let json: serde_json::Value = serde_json::from_slice(&output.stdout)?;
        let obj = json.as_array().and_then(|a| a.first()).and_then(|v| v.as_object());

        let mut data = ExifData::default();

        if let Some(obj) = obj {
            data.camera_make = obj.get("Make").and_then(|v| v.as_str()).map(|s| s.to_string());
            data.camera_model = obj.get("Model").and_then(|v| v.as_str()).map(|s| s.to_string());
            data.lens_model = obj.get("LensModel").and_then(|v| v.as_str()).map(|s| s.to_string());
            data.iso = obj.get("ISO").and_then(|v| v.as_str()).and_then(|s| s.parse().ok());
            data.date_time_original = obj.get("DateTimeOriginal").and_then(|v| v.as_str()).map(|s| s.to_string());

            if let Some(ap) = obj.get("FNumber").and_then(|v| v.as_str()) {
                data.aperture = ap.trim_start_matches('f').parse().ok();
            }

            if let Some(shutter) = obj.get("ExposureTime").and_then(|v| v.as_str()) {
                let parts: Vec<&str> = shutter.split('/').collect();
                if parts.len() == 2 {
                    data.shutter_num = parts[0].parse().ok();
                    data.shutter_den = parts[1].parse().ok();
                }
            }

            if let Some(fl) = obj.get("FocalLength").and_then(|v| v.as_str()) {
                data.focal_length = fl.trim_end_matches(" mm").parse().ok();
            }

            // GPS
            data.gps_latitude = obj.get("GPSLatitude").and_then(|v| v.as_str()).and_then(|s| {
                parse_dms(s)
            });
            data.gps_longitude = obj.get("GPSLongitude").and_then(|v| v.as_str()).and_then(|s| {
                parse_dms(s)
            });
        }

        Ok(data)
    }
}

/// Parses DMS (degrees, minutes, seconds) string from exiftool into decimal degrees.
fn parse_dms(dms: &str) -> Option<f64> {
    let parts: Vec<f64> = dms
        .trim()
        .trim_end_matches('°')
        .split_whitespace()
        .filter_map(|p| p.trim_end_matches([' ', '\'', '"']).parse().ok())
        .collect();

    if parts.len() >= 3 {
        Some(parts[0] + parts[1] / 60.0 + parts[2] / 3600.0)
    } else if parts.len() == 1 {
        Some(parts[0])
    } else {
        None
    }
}
