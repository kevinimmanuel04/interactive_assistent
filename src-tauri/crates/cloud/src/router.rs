//! OpenCode Zen Smart Router, Domain Classifier, Explicit Override Parser,
//! and Auto-Failover Matrix.

use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Domain {
    Math,
    Coding,
    Tutor,
    General,
}

impl fmt::Display for Domain {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Domain::Math => write!(f, "Math Mode"),
            Domain::Coding => write!(f, "Coding Mode"),
            Domain::Tutor => write!(f, "Tutor Mode"),
            Domain::General => write!(f, "General Mode"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelSpec {
    pub id: &'static str,
    pub endpoint_id: &'static str,
    pub display_name: &'static str,
}

// OpenCode Zen Models (Non-Nvidia models from OpenCode Zen ecosystem)
pub const MODEL_LAGUNA_S: ModelSpec = ModelSpec {
    id: "laguna-s-2.1-free",
    endpoint_id: "laguna-s-2.1-free",
    display_name: "Laguna S 2.1",
};

pub const MODEL_LING_3: ModelSpec = ModelSpec {
    id: "ling-3.0-flash-fin-free",
    endpoint_id: "ling-3.0-flash-fin-free",
    display_name: "Ling 3.0 Flash",
};

pub const MODEL_BIG_PICKLE: ModelSpec = ModelSpec {
    id: "big-pickle",
    endpoint_id: "big-pickle",
    display_name: "Big Pickle",
};

pub const MODEL_MIMO_V2_5: ModelSpec = ModelSpec {
    id: "mimo-v2.5-free",
    endpoint_id: "mimo-v2.5-free",
    display_name: "Mimo v2.5",
};

pub const MODEL_MUSE_SPARK: ModelSpec = ModelSpec {
    id: "muse-spark-1.2-contributor-free",
    endpoint_id: "muse-spark-1.2-contributor-free",
    display_name: "Muse Spark",
};

pub const MODEL_DEEPSEEK_V4_FLASH: ModelSpec = ModelSpec {
    id: "deepseek-v4-flash",
    endpoint_id: "deepseek-v4-flash",
    display_name: "DeepSeek V4 Flash",
};

pub const MODEL_DEEPSEEK_V4_FREE: ModelSpec = ModelSpec {
    id: "deepseek-v4-flash-free",
    endpoint_id: "deepseek-v4-flash-free",
    display_name: "DeepSeek V4 Free",
};

pub const MODEL_GEMINI_3_5_FLASH: ModelSpec = ModelSpec {
    id: "gemini-3.5-flash",
    endpoint_id: "gemini-3.5-flash",
    display_name: "Gemini 3.5 Flash",
};

pub const MODEL_GEMINI_3_5_FLASH_LITE: ModelSpec = ModelSpec {
    id: "gemini-3.5-flash-lite",
    endpoint_id: "gemini-3.5-flash-lite",
    display_name: "Gemini 3.5 Flash Lite",
};

pub const MODEL_CLAUDE_HAIKU_4_5: ModelSpec = ModelSpec {
    id: "claude-haiku-4-5",
    endpoint_id: "claude-haiku-4-5",
    display_name: "Claude Haiku 4.5",
};

pub const MODEL_CLAUDE_SONNET_4_5: ModelSpec = ModelSpec {
    id: "claude-sonnet-4-5",
    endpoint_id: "claude-sonnet-4-5",
    display_name: "Claude Sonnet 4.5",
};

pub const MODEL_GPT_5_4_MINI: ModelSpec = ModelSpec {
    id: "gpt-5.4-mini",
    endpoint_id: "gpt-5.4-mini",
    display_name: "GPT 5.4 Mini",
};

pub const MODEL_QWEN_3_5_PLUS: ModelSpec = ModelSpec {
    id: "qwen3.5-plus",
    endpoint_id: "qwen3.5-plus",
    display_name: "Qwen 3.5 Plus",
};

pub const MODEL_KIMI_K2_7: ModelSpec = ModelSpec {
    id: "kimi-k2.7-code",
    endpoint_id: "kimi-k2.7-code",
    display_name: "Kimi K2.7 Code",
};

pub const MODEL_MINIMAX_M2_5: ModelSpec = ModelSpec {
    id: "minimax-m2.5",
    endpoint_id: "minimax-m2.5",
    display_name: "MiniMax M2.5",
};

pub const MODEL_GROK_4_5: ModelSpec = ModelSpec {
    id: "grok-4.5",
    endpoint_id: "grok-4.5",
    display_name: "Grok 4.5",
};

pub const MODEL_GLM_5: ModelSpec = ModelSpec {
    id: "glm-5",
    endpoint_id: "glm-5",
    display_name: "GLM 5",
};

// OpenRouter Models
pub const MODEL_GEMINI_2_5_FLASH: ModelSpec = ModelSpec {
    id: "google/gemini-2.5-flash",
    endpoint_id: "google/gemini-2.5-flash",
    display_name: "Gemini 2.5 Flash",
};

pub const MODEL_GPT_4O_MINI: ModelSpec = ModelSpec {
    id: "openai/gpt-4o-mini",
    endpoint_id: "openai/gpt-4o-mini",
    display_name: "GPT-4o Mini",
};

pub const MODEL_DEEPSEEK_V3: ModelSpec = ModelSpec {
    id: "deepseek/deepseek-chat",
    endpoint_id: "deepseek/deepseek-chat",
    display_name: "DeepSeek V3",
};

pub const MODEL_CLAUDE_3_5_SONNET: ModelSpec = ModelSpec {
    id: "anthropic/claude-3.5-sonnet",
    endpoint_id: "anthropic/claude-3.5-sonnet",
    display_name: "Claude 3.5 Sonnet",
};

pub const ALL_MODELS: &[ModelSpec] = &[
    MODEL_LAGUNA_S,
    MODEL_LING_3,
    MODEL_BIG_PICKLE,
    MODEL_MIMO_V2_5,
    MODEL_MUSE_SPARK,
    MODEL_DEEPSEEK_V4_FLASH,
    MODEL_DEEPSEEK_V4_FREE,
    MODEL_GEMINI_3_5_FLASH,
    MODEL_GEMINI_3_5_FLASH_LITE,
    MODEL_CLAUDE_HAIKU_4_5,
    MODEL_CLAUDE_SONNET_4_5,
    MODEL_GPT_5_4_MINI,
    MODEL_QWEN_3_5_PLUS,
    MODEL_KIMI_K2_7,
    MODEL_MINIMAX_M2_5,
    MODEL_GROK_4_5,
    MODEL_GLM_5,
    MODEL_GEMINI_2_5_FLASH,
    MODEL_GPT_4O_MINI,
    MODEL_DEEPSEEK_V3,
    MODEL_CLAUDE_3_5_SONNET,
];

pub fn find_model_by_id(query: &str) -> Option<ModelSpec> {
    let lower = query.to_lowercase();
    ALL_MODELS
        .iter()
        .find(|m| m.id.to_lowercase() == lower || m.display_name.to_lowercase() == lower)
        .cloned()
}

pub fn classify_domain(prompt: &str) -> Domain {
    let lower = prompt.to_lowercase();

    let math_keywords = [
        "solve", "derivative", "integral", "equation", "matrix", "proof", "calculus", "algebra",
        "solve for", "d/dx", "sin(", "cos(", "log(", "sqrt(", "theorem",
    ];
    if math_keywords.iter().any(|&k| lower.contains(k)) {
        return Domain::Math;
    }

    let coding_keywords = [
        "verilog", "vhdl", "c++", "react", "rust", "platformio", "function", "compile", "code",
        "debug", "fn ", "struct ", "impl ", "import ", "const ", "let ", "def ", "class ", "git",
        "api", "script", "refactor",
    ];
    if coding_keywords.iter().any(|&k| lower.contains(k)) {
        return Domain::Coding;
    }

    let tutor_keywords = [
        "teach me",
        "explain like",
        "syllabus",
        "concept",
        "how does",
        "explain",
        "what is",
        "overview of",
        "step by step",
    ];
    if tutor_keywords.iter().any(|&k| lower.contains(k)) {
        return Domain::Tutor;
    }

    Domain::General
}

pub fn parse_explicit_override(prompt: &str) -> Option<(ModelSpec, String)> {
    let lower = prompt.trim().to_lowercase();
    let prefixes = ["use ", "switch to ", "run with "];

    for prefix in prefixes {
        if lower.starts_with(prefix) {
            let remainder = prompt.trim()[prefix.len()..].trim();
            let model_candidate = remainder.split_whitespace().next().unwrap_or("");
            if let Some(spec) = find_model_by_id(model_candidate) {
                let clean_prompt = remainder[model_candidate.len()..].trim().to_string();
                return Some((spec, clean_prompt));
            }
        }
    }

    None
}

#[derive(Debug, Clone)]
pub struct ResolvedRoute {
    pub chain: Vec<ModelSpec>,
    pub initial_label: String,
    pub domain: Domain,
    pub is_override: bool,
    pub cleaned_prompt: Option<String>,
}

pub fn resolve_smart_route(prompt: &str, _configured_default: &str, api_key: &str) -> ResolvedRoute {
    if let Some((spec, cleaned)) = parse_explicit_override(prompt) {
        let label = format!("🔒 Locked: {}", spec.display_name);
        return ResolvedRoute {
            chain: vec![spec],
            initial_label: label,
            domain: Domain::General,
            is_override: true,
            cleaned_prompt: Some(cleaned),
        };
    }

    let domain = classify_domain(prompt);

    // If using OpenRouter key (sk-or-...), route to OpenRouter fast endpoints
    let chain = if api_key.starts_with("sk-or-") {
        match domain {
            Domain::Math => vec![
                MODEL_GEMINI_2_5_FLASH,
                MODEL_DEEPSEEK_V3,
                MODEL_GPT_4O_MINI,
                MODEL_CLAUDE_3_5_SONNET,
            ],
            Domain::Coding => vec![
                MODEL_DEEPSEEK_V3,
                MODEL_CLAUDE_3_5_SONNET,
                MODEL_GEMINI_2_5_FLASH,
                MODEL_GPT_4O_MINI,
            ],
            Domain::Tutor => vec![
                MODEL_GEMINI_2_5_FLASH,
                MODEL_DEEPSEEK_V3,
                MODEL_GPT_4O_MINI,
                MODEL_CLAUDE_3_5_SONNET,
            ],
            Domain::General => vec![
                MODEL_GEMINI_2_5_FLASH,
                MODEL_DEEPSEEK_V3,
                MODEL_GPT_4O_MINI,
                MODEL_CLAUDE_3_5_SONNET,
            ],
        }
    } else {
        // OpenCode Zen Model Matrix: Non-Nvidia diverse models (Laguna, Ling, Big Pickle, Mimo, Muse, Gemini, Claude, GPT, Qwen, Kimi)
        match domain {
            Domain::Math => vec![
                MODEL_LAGUNA_S,
                MODEL_LING_3,
                MODEL_BIG_PICKLE,
                MODEL_MIMO_V2_5,
                MODEL_QWEN_3_5_PLUS,
                MODEL_GEMINI_3_5_FLASH,
                MODEL_GPT_5_4_MINI,
                MODEL_DEEPSEEK_V4_FLASH,
            ],
            Domain::Coding => vec![
                MODEL_LAGUNA_S,
                MODEL_KIMI_K2_7,
                MODEL_BIG_PICKLE,
                MODEL_LING_3,
                MODEL_QWEN_3_5_PLUS,
                MODEL_MIMO_V2_5,
                MODEL_GPT_5_4_MINI,
                MODEL_CLAUDE_SONNET_4_5,
                MODEL_DEEPSEEK_V4_FLASH,
            ],
            Domain::Tutor => vec![
                MODEL_LAGUNA_S,
                MODEL_LING_3,
                MODEL_BIG_PICKLE,
                MODEL_CLAUDE_HAIKU_4_5,
                MODEL_MIMO_V2_5,
                MODEL_GEMINI_3_5_FLASH_LITE,
                MODEL_MUSE_SPARK,
                MODEL_MINIMAX_M2_5,
            ],
            Domain::General => vec![
                MODEL_LAGUNA_S,
                MODEL_LING_3,
                MODEL_BIG_PICKLE,
                MODEL_MIMO_V2_5,
                MODEL_GEMINI_3_5_FLASH,
                MODEL_CLAUDE_HAIKU_4_5,
                MODEL_GPT_5_4_MINI,
                MODEL_QWEN_3_5_PLUS,
                MODEL_GROK_4_5,
                MODEL_GLM_5,
                MODEL_DEEPSEEK_V4_FLASH,
            ],
        }
    };

    let primary = &chain[0];
    let initial_label = format!("⚡ Auto: {} ({})", primary.display_name, domain);

    ResolvedRoute {
        chain,
        initial_label,
        domain,
        is_override: false,
        cleaned_prompt: None,
    }
}
