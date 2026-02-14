import { state } from './state.js';
import { elements } from './dom.js';
import { updateConnectionStatus } from './utils.js';

// Helper function to parse models from SwarmUI response
function parseModels(data) {
    let models = [];
    
    console.log('SwarmUI models response:', data);
    
    if (data.models && Array.isArray(data.models)) {
        // Models could be strings or objects with a name property
        models = data.models.map(m => typeof m === 'string' ? m : (m.name || m.title || JSON.stringify(m)));
    } else if (data.files && Array.isArray(data.files)) {
        // Files could be strings or objects
        models = data.files
            .map(f => typeof f === 'string' ? f : (f.name || f.title || f.path || null))
            .filter(f => f && typeof f === 'string' && (f.endsWith('.safetensors') || f.endsWith('.ckpt') || !f.includes('.')));
    } else if (typeof data === 'object') {
        // Try to find any array that contains model information
        for (const key of Object.keys(data)) {
            if (Array.isArray(data[key]) && data[key].length > 0) {
                const arr = data[key]
                    .map(item => {
                        if (typeof item === 'string') return item;
                        if (typeof item === 'object' && item !== null) {
                            return item.name || item.title || item.path || null;
                        }
                        return null;
                    })
                    .filter(item => item && typeof item === 'string');
                
                if (arr.length > 0) {
                    models = arr;
                    break;
                }
            }
        }
    }
    
    console.log('Available models:', models);
    return models;
}

// Fetch available models from SwarmUI
export async function fetchSwarmModels() {
    const url = elements.swarmUrl.value;
    
    try {
        elements.fetchModelsBtn.disabled = true;
        elements.fetchModelsBtn.innerHTML = `
            <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            Fetching...
        `;
        
        // Get session first
        if (!state.sessionId) {
            await getSwarmSession();
        }
        
        const response = await fetch(`${url}/API/ListModels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: state.sessionId,
                path: "",
                depth: 2
            })
        });
        
        if (!response.ok) {
            // Try to refresh session and retry
            await getSwarmSession();
            
            const retryResponse = await fetch(`${url}/API/ListModels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: state.sessionId,
                    path: "",
                    depth: 2
                })
            });
            
            if (!retryResponse.ok) throw new Error('Failed to fetch models');
            
            const retryData = await retryResponse.json();
            const models = parseModels(retryData);
            
            // Populate select
            elements.swarmModel.innerHTML = '<option value="">Select a model...</option>';
            
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                elements.swarmModel.appendChild(option);
            });
            
            updateConnectionStatus(true);
            alert(`Successfully fetched ${models.length} models!`);
            return;
        }
        
        const data = await response.json();
        const models = parseModels(data);
        
        // Populate select
        elements.swarmModel.innerHTML = '<option value="">Select a model...</option>';
        
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            elements.swarmModel.appendChild(option);
        });
        
        updateConnectionStatus(true);
        alert(`Successfully fetched ${models.length} models!`);
        
    } catch (error) {
        console.error('Error fetching models:', error);
        updateConnectionStatus(false);
        alert('Failed to fetch models. Make sure SwarmUI is running at the specified URL.');
    } finally {
        elements.fetchModelsBtn.disabled = false;
        elements.fetchModelsBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Fetch Models
        `;
    }
}

// Get new session from SwarmUI
export async function getSwarmSession() {
    const url = elements.swarmUrl.value;
    
    try {
        const response = await fetch(`${url}/API/GetNewSession`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        
        if (!response.ok) throw new Error('Failed to get session');
        
        const data = await response.json();
        state.sessionId = data.session_id;
        updateConnectionStatus(true);
        return data.session_id;
        
    } catch (error) {
        console.error('Error getting session:', error);
        updateConnectionStatus(false);
        throw error;
    }
}

// Generate image using SwarmUI
export async function generateImage(prompt) {
    const url = elements.swarmUrl.value;
    
    try {
        elements.imageIndicator.classList.remove('hidden');
        
        // Get session if needed
        if (!state.sessionId) {
            await getSwarmSession();
        }
        
        const response = await fetch(`${url}/API/GenerateText2Image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: state.sessionId,
                images: 1,
                prompt: prompt,
                negativeprompt: " (bad quality:1.15), (worst quality:1.3)",
                model: elements.swarmModel.value,
                width: parseInt(elements.imgWidth.value),
                height: parseInt(elements.imgHeight.value),
                steps: parseInt(elements.steps.value),
                cfgscale: parseFloat(elements.cfgScale.value),
                sampler_name: elements.sampler.value,
                seed: -1,
                aspectratio: "2:3",
                automaticvae: true,
                batchsize: "1",
                clipstopatlayer: "-2",
                colorcorrectionbehavior: "None",
                colordepth: "8bit",
                sampler: "euler_ancestral",
                scheduler: "karras",
            })
        });
        
        if (!response.ok) {
            // Try to refresh session
            await getSwarmSession();
            
            // Retry
            const retryResponse = await fetch(`${url}/API/GenerateText2Image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: state.sessionId,
                    images: 1,
                    prompt: prompt,
                    model: elements.swarmModel.value,
                    width: parseInt(elements.imgWidth.value),
                    height: parseInt(elements.imgHeight.value),
                    steps: parseInt(elements.steps.value),
                    cfgscale: parseFloat(elements.cfgScale.value),
                    sampler_name: elements.sampler.value,
                    seed: -1
                })
            });
            
            if (!retryResponse.ok) throw new Error('Failed to generate image after retry');
            
            const retryData = await retryResponse.json();
            if (retryData.images && retryData.images.length > 0) {
                const imagePath = retryData.images[0];
                return `${url}/${imagePath}`;
            }
        }
        
        const data = await response.json();
        
        if (data.images && data.images.length > 0) {
            const imagePath = data.images[0];
            return `${url}/${imagePath}`;
        }
        
        throw new Error('No image generated');
        
    } catch (error) {
        console.error('Error generating image:', error);
        throw error;
    } finally {
        elements.imageIndicator.classList.add('hidden');
    }
}
