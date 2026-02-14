# 💋 EroChat + SwarmUI

An AI-powered erotic roleplay chat application that combines OpenRouter's language models with local SwarmUI image generation for immersive, visually-enhanced conversations.

## ✨ Features

- **🤖 AI-Powered Chat** - Engage in intimate, creative conversations using OpenRouter's API
- **🎨 Automatic Image Generation** - Every AI response is visualized with images generated via your local SwarmUI instance
- **👤 Custom Characters** - Create and manage multiple characters with unique personalities and system prompts
- **⚙️ Flexible Configuration** - Adjust generation settings including model, sampler, CFG scale, steps, and image dimensions
- **💾 Local Storage** - All settings and chat history persist in your browser's localStorage
- **📱 Responsive Design** - Modern, sleek interface with glassmorphism styling and purple/pink gradients
- **🔑 API Integration** - Support for multiple LLM models via OpenRouter

## 🚀 Getting Started

### Prerequisites

- A modern web browser
- An [OpenRouter](https://openrouter.ai/) API key
- [SwarmUI](https://github.com/mcmonkeyprojects/SwarmUI) running locally (or on a remote server)

### Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd EroChat
```

2. **No build step required!** This is a vanilla JavaScript application. Simply open `index.html` in your browser or serve it with any static file server.

   Using Python:
   ```bash
   python -m http.server 8080
   ```

   Using Node.js (npx):
   ```bash
   npx serve .
   ```

3. Open `http://localhost:8080` (or your preferred port) in your browser.

## ⚙️ Configuration

### 1. OpenRouter Setup

1. Get your API key from [OpenRouter](https://openrouter.ai/keys)
2. Enter the key in the Settings sidebar
3. Click "Fetch OpenRouter Models" to load available models
4. Select your preferred model

### 2. SwarmUI Setup

1. Ensure SwarmUI is running (default: `http://localhost:7801`)
2. If using a different URL, update the "Base URL" field
3. Click "Fetch Models" to load your installed checkpoints
4. Select your preferred model

### 3. Generation Settings

Customize image generation parameters:
- **Width/Height**: Output image dimensions (default: 832×1216)
- **Steps**: Sampling steps (20-40, default: 25)
- **CFG Scale**: Classifier-free guidance scale (6-8, default: 7)
- **Sampler**: Choose from Euler a, DPM++, DDIM, etc.

### 4. System Prompt

The default system prompt instructs the AI to be seductive, explicit, and automatically append image prompts after each response. You can customize this for each character.

## 🎭 Creating Characters

1. Click "+ New" in the Characters section
2. Set a name and avatar emoji
3. Customize the system prompt to define personality
4. Save and start chatting!

**Image Prompt Format**: Character prompts should include image generation instructions:
```
---IMAGE_PROMPT START---
masterpiece, best quality, ultra-detailed, 8k, realistic, [scene description...]
---IMAGE_PROMPT END---
```

## 📁 Project Structure

```
EroChat/
├── index.html          # Main HTML structure
├── css/
│   └── styles.css      # Custom styles + Tailwind
└── js/
    ├── main.js         # Application entry point
    ├── config.js       # Default configurations
    ├── state.js        # Global state management
    ├── dom.js          # DOM element references
    ├── events.js       # Event listeners
    ├── ui.js           # UI utilities
    ├── messages.js     # Message rendering & image handling
    ├── characters.js   # Character management
    ├── api-openrouter.js  # OpenRouter API integration
    ├── api-swarmui.js     # SwarmUI API integration
    ├── storage.js      # localStorage persistence
    └── utils.js        # Utility functions
```

## 🔧 Technologies Used

- **Frontend**: Vanilla JavaScript (ES6+ modules), HTML5
- **Styling**: Tailwind CSS (CDN) + Custom CSS (glassmorphism effects)
- **APIs**: OpenRouter Chat API, SwarmUI API
- **Storage**: Browser localStorage

## 📝 API Endpoints Used

### OpenRouter
- `POST https://openrouter.ai/api/v1/chat/completions` - Chat completion
- `GET https://openrouter.ai/api/v1/models` - List available models

### SwarmUI
- `POST /API/GenerateText2Image` - Generate images
- `GET /API/ListModels` - List available models
- `GET /API/GetCurrentStatus` - Check server status

## 🔒 Privacy & Security

- **API keys** are stored only in your browser's localStorage
- **Chat history** is stored locally and never sent to external servers
- **Images** are generated locally via your own SwarmUI instance
- No data collection or telemetry

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "OpenRouter API key required" | Enter your API key in settings |
| "No SwarmUI model selected" | Click "Fetch Models" and select a model |
| Images not generating | Check that SwarmUI is running and accessible |
| Connection status shows "Disconnected" | Verify SwarmUI URL and ensure it's running |
| Slow responses | Try a different OpenRouter model or reduce max tokens |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📜 License

MIT License - feel free to use, modify, and distribute.

## ⚠️ Disclaimer

This application is intended for adult users only (18+). Users are responsible for complying with OpenRouter's Terms of Service and their local laws.

---

Built with 💜 for creative AI interactions
