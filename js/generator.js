import { state } from './state.js';
import { saveToLocalStorage } from './storage.js';
import {
    toggleAdvancedSettings,
    renderGallery,
    renderGalleryCharacterFilter,
    renderGalleryThumbnailCharacterSelect
} from './ui.js';
import {
    fetchGeneratorAssets,
    fetchGeneratorJobs,
    createGeneratorJobs,
    updateGeneratorJob,
    executeGeneratorJob
} from './api-generator.js';
import {
    PROMPT_TEMPLATE_GROUPS,
    appendTemplateSnippet,
    runPromptHelperAction
} from './prompt-helper.js';
import { uploadFileForStorage } from './media.js';
import { normalizeSwarmSampler, syncSwarmSamplerSelect } from './utils.js';
import { recordGeneratedMedia, recordGeneratorBatch } from './stats.js';

let elements = null;
let initialized = false;
let selectedSources = [];
let isQueueRunning = false;

function getElements() {
    return {
        generatorView: document.getElementById('generatorView'),
        generatorMode: document.getElementById('generatorMode'),
        generatorProvider: document.getElementById('generatorProvider'),
        generatorPrompt: document.getElementById('generatorPrompt'),
        generatorNegativePrompt: document.getElementById('generatorNegativePrompt'),
        generatorNegativePromptWrap: document.getElementById('generatorNegativePromptWrap'),
        generatorSourcePanel: document.getElementById('generatorSourcePanel'),
        generatorBatchCount: document.getElementById('generatorBatchCount'),
        generatorAspectRatio: document.getElementById('generatorAspectRatio'),
        generatorEditAspectRatio: document.getElementById('generatorEditAspectRatio'),
        generatorImageResolution: document.getElementById('generatorImageResolution'),
        generatorEditResolution: document.getElementById('generatorEditResolution'),
        generatorVideoDuration: document.getElementById('generatorVideoDuration'),
        generatorVideoAspectRatio: document.getElementById('generatorVideoAspectRatio'),
        generatorVideoResolution: document.getElementById('generatorVideoResolution'),
        generatorSwarmWidth: document.getElementById('generatorSwarmWidth'),
        generatorSwarmHeight: document.getElementById('generatorSwarmHeight'),
        generatorSwarmSteps: document.getElementById('generatorSwarmSteps'),
        generatorSwarmCfgScale: document.getElementById('generatorSwarmCfgScale'),
        generatorSwarmSampler: document.getElementById('generatorSwarmSampler'),
        generatorSwarmSeedMode: document.getElementById('generatorSwarmSeedMode'),
        generatorSwarmBaseSeed: document.getElementById('generatorSwarmBaseSeed'),
        generatorHelperProvider: document.getElementById('generatorHelperProvider'),
        generatorHelperStatus: document.getElementById('generatorHelperStatus'),
        generatorPresets: document.getElementById('generatorPresets'),
        generatorPresetName: document.getElementById('generatorPresetName'),
        generatorTemplateChips: document.getElementById('generatorTemplateChips'),
        generatorSubmitBtn: document.getElementById('generatorSubmitBtn'),
        generatorSourceUpload: document.getElementById('generatorSourceUpload'),
        generatorRecentSource: document.getElementById('generatorRecentSource'),
        gallerySourcePicker: document.getElementById('gallerySourcePicker'),
        addRecentSourceBtn: document.getElementById('addRecentSourceBtn'),
        addGallerySourceBtn: document.getElementById('addGallerySourceBtn'),
        selectedGeneratorSources: document.getElementById('selectedGeneratorSources'),
        generatorQueueSummary: document.getElementById('generatorQueueSummary'),
        generatorQueueList: document.getElementById('generatorQueueList'),
        generatorResults: document.getElementById('generatorResults'),
        generatorGrokFields: document.getElementById('generatorGrokFields'),
        generatorSwarmFields: document.getElementById('generatorSwarmFields'),
        generatorEditFields: document.getElementById('generatorEditFields'),
        generatorVideoFields: document.getElementById('generatorVideoFields'),
        promptHelperBtns: Array.from(document.querySelectorAll('[data-generator-helper-action]')),
        promptPresetSaveBtn: document.getElementById('promptPresetSaveBtn'),
        promptPresetApplyBtn: document.getElementById('promptPresetApplyBtn')
    };
}

function updatePrefs(patch) {
    Object.assign(state.generatorPrefs, patch);
    saveToLocalStorage();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getGeneratorAssetsForPicker() {
    return state.generatorAssets.filter((asset) => asset.mediaType === 'image');
}

function getGalleryImageOptions() {
    return state.galleryImages.filter((item) => item.imageUrl);
}

function upsertJobs(jobs) {
    const map = new Map(state.generatorJobs.map((job) => [job.id, job]));
    jobs.forEach((job) => map.set(job.id, { ...map.get(job.id), ...job }));
    state.generatorJobs = Array.from(map.values()).sort((a, b) => b.id - a.id);
}

function upsertAssets(assets) {
    const map = new Map(state.generatorAssets.map((asset) => [asset.id, asset]));
    assets.forEach((asset) => map.set(asset.id, { ...map.get(asset.id), ...asset }));
    state.generatorAssets = Array.from(map.values()).sort((a, b) => b.id - a.id);
    renderGalleryCharacterFilter();
    renderGalleryThumbnailCharacterSelect();
    renderGallery();
}

function serializeSourceAssetIds() {
    return Array.from(new Set(selectedSources.map((source) => source.assetId).filter(Boolean)));
}

function serializeSourceUrls() {
    return selectedSources.map((source) => source.url).filter(Boolean);
}

function getModeLabel(mode) {
    switch (mode) {
        case 'image_edit':
            return 'Edit';
        case 'video_generate':
            return 'Video';
        default:
            return 'Create';
    }
}

function getProviderLabel(provider) {
    if (provider === 'swarm') return 'SwarmUI';
    if (provider === 'comfy') return 'ComfyUI';
    return provider || 'Unknown';
}

function applyPrefsToForm() {
    elements.generatorMode.value = state.generatorPrefs.mode || 'image_generate';
    elements.generatorProvider.value = state.generatorPrefs.provider || 'swarm';
    elements.generatorPrompt.value = state.generatorPrefs.prompt || '';
    elements.generatorNegativePrompt.value = state.generatorPrefs.negativePrompt || '';
    elements.generatorBatchCount.value = state.generatorPrefs.batchCount || 1;
    if (elements.generatorAspectRatio) elements.generatorAspectRatio.value = state.generatorPrefs.aspectRatio || 'auto';
    if (elements.generatorEditAspectRatio) elements.generatorEditAspectRatio.value = state.generatorPrefs.aspectRatio || 'auto';
    if (elements.generatorImageResolution) elements.generatorImageResolution.value = state.generatorPrefs.imageResolution || '1k';
    if (elements.generatorEditResolution) elements.generatorEditResolution.value = state.generatorPrefs.editResolution || '1k';
    if (elements.generatorVideoDuration) elements.generatorVideoDuration.value = state.generatorPrefs.videoDuration || 4;
    if (elements.generatorVideoAspectRatio) elements.generatorVideoAspectRatio.value = state.generatorPrefs.videoAspectRatio || '16:9';
    if (elements.generatorVideoResolution) elements.generatorVideoResolution.value = state.generatorPrefs.videoResolution || '480p';
    if (elements.generatorSwarmWidth) elements.generatorSwarmWidth.value = state.generatorPrefs.swarmWidth || 832;
    if (elements.generatorSwarmHeight) elements.generatorSwarmHeight.value = state.generatorPrefs.swarmHeight || 1216;
    if (elements.generatorSwarmSteps) elements.generatorSwarmSteps.value = state.generatorPrefs.swarmSteps || 25;
    if (elements.generatorSwarmCfgScale) elements.generatorSwarmCfgScale.value = state.generatorPrefs.swarmCfgScale || 7;
    syncSwarmSamplerSelect(elements.generatorSwarmSampler, state.generatorPrefs.swarmSampler);
    if (elements.generatorSwarmSeedMode) elements.generatorSwarmSeedMode.value = state.generatorPrefs.swarmSeedMode || 'random';
    if (elements.generatorSwarmBaseSeed) elements.generatorSwarmBaseSeed.value = state.generatorPrefs.swarmBaseSeed || 1;
    elements.generatorHelperProvider.value = state.generatorPrefs.helperProvider || 'off';
}

function renderPromptTemplates() {
    elements.generatorTemplateChips.innerHTML = PROMPT_TEMPLATE_GROUPS.map(
        (group) => `
        <div class="generator-chip-group">
            <p class="generator-overline mb-2">${escapeHtml(group.label)}</p>
            <div class="flex flex-wrap gap-2">
                ${group.chips
                    .map(
                        (chip) => `
                    <button type="button" class="generator-chip" data-template-chip="${escapeHtml(chip)}">${escapeHtml(chip)}</button>
                `
                    )
                    .join('')}
            </div>
        </div>
    `
    ).join('');
}

function renderPresets() {
    const presets = Array.isArray(state.generatorPrefs.promptPresets)
        ? state.generatorPrefs.promptPresets
        : [];
    elements.generatorPresets.innerHTML = '<option value="">Select a preset...</option>';
    presets.forEach((preset, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = preset.name;
        elements.generatorPresets.appendChild(option);
    });
}

function renderSourcePickers() {
    elements.generatorRecentSource.innerHTML =
        '<option value="">Select a recent generator image...</option>';
    getGeneratorAssetsForPicker().forEach((asset) => {
        const option = document.createElement('option');
        option.value = String(asset.id);
        option.textContent = `${asset.prompt || 'Generator image'} (#${asset.id})`;
        elements.generatorRecentSource.appendChild(option);
    });

    elements.gallerySourcePicker.innerHTML = '<option value="">Select a gallery image...</option>';
    getGalleryImageOptions().forEach((item) => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.characterName || item.source || 'Gallery image';
        elements.gallerySourcePicker.appendChild(option);
    });
}

function renderSelectedSources() {
    if (selectedSources.length === 0) {
        elements.selectedGeneratorSources.innerHTML =
            '<p class="text-sm text-gray-500">No source images selected yet.</p>';
        return;
    }

    elements.selectedGeneratorSources.innerHTML = selectedSources
        .map(
            (source) => `
        <div class="generator-source-pill">
            <img src="${source.url}" alt="Source" class="generator-source-thumb">
            <div class="min-w-0">
                <p class="text-sm text-gray-200 truncate">${escapeHtml(source.label)}</p>
                <p class="generator-overline">${escapeHtml(source.origin)}</p>
            </div>
            <button type="button" class="generator-chip" data-remove-source="${escapeHtml(source.id)}">Remove</button>
        </div>
    `
        )
        .join('');
}

function renderQueueSummary() {
    const total = state.generatorJobs.length;
    const running = state.generatorJobs.filter(
        (job) => job.status === 'running' || job.status === 'polling'
    ).length;
    const completed = state.generatorJobs.filter((job) => job.status === 'succeeded').length;
    const failed = state.generatorJobs.filter(
        (job) => job.status === 'failed' || job.status === 'interrupted'
    ).length;

    elements.generatorQueueSummary.innerHTML = `
        <div class="generator-stat"><span>Total</span><strong>${total}</strong></div>
        <div class="generator-stat"><span>Active</span><strong>${running}</strong></div>
        <div class="generator-stat"><span>Done</span><strong>${completed}</strong></div>
        <div class="generator-stat"><span>Issues</span><strong>${failed}</strong></div>
    `;
}

function renderQueueList() {
    const jobs = state.generatorJobs.slice(0, 16);
    if (jobs.length === 0) {
        elements.generatorQueueList.innerHTML =
            '<p class="text-sm text-gray-500">No generator jobs yet.</p>';
        return;
    }

    elements.generatorQueueList.innerHTML = jobs
        .map(
            (job) => `
        <div class="generator-job-card">
            <div class="flex items-center justify-between gap-3">
                <p class="font-medium text-gray-200">${escapeHtml(getModeLabel(job.mode))} · ${escapeHtml(getProviderLabel(job.provider))}</p>
                <span class="generator-status generator-status-${escapeHtml(job.status)}">${escapeHtml(job.status)}</span>
            </div>
            <p class="text-sm text-gray-400 mt-2 line-clamp-3">${escapeHtml(job.prompt)}</p>
            ${job.errorMessage ? `<p class="text-xs text-red-300 mt-2">${escapeHtml(job.errorMessage)}</p>` : ''}
        </div>
    `
        )
        .join('');
}

function renderResults() {
    const assets = state.generatorAssets.slice(0, 24);
    if (assets.length === 0) {
        elements.generatorResults.innerHTML =
            '<p class="text-sm text-gray-500">Generated results will appear here.</p>';
        return;
    }

    elements.generatorResults.innerHTML = assets
        .map(
            (asset) => `
        <article class="generator-result-card">
            <div class="generator-result-media">
                ${
                    asset.mediaType === 'video'
                        ? `<video src="${asset.url}" autoplay loop muted playsinline class="w-full h-full object-cover rounded-xl"></video>`
                        : `<img src="${asset.url}" alt="Generated" class="w-full h-full object-cover rounded-xl">`
                }
            </div>
            <div class="mt-3 space-y-3">
                <div>
                    <p class="generator-overline">${escapeHtml(asset.mode || 'generator')}</p>
                    <p class="text-sm text-gray-200 generator-clamp">${escapeHtml(asset.prompt || 'Generated asset')}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${asset.mediaType === 'image' ? `<button type="button" class="generator-chip" data-result-action="edit" data-asset-id="${asset.id}">Edit</button>` : ''}
                    ${asset.mediaType === 'image' ? `<button type="button" class="generator-chip" data-result-action="video" data-asset-id="${asset.id}">Make Video</button>` : ''}
                    ${asset.mediaType === 'image' ? `<button type="button" class="generator-chip" data-result-action="reuse-prompt" data-asset-id="${asset.id}">Reuse Prompt</button>` : ''}
                    ${asset.mediaType === 'video' ? `<button type="button" class="generator-chip" data-result-action="reuse-source" data-asset-id="${asset.id}">Reuse Source</button>` : ''}
                    ${asset.mediaType === 'video' ? `<button type="button" class="generator-chip" data-result-action="retry" data-asset-id="${asset.id}">Retry</button>` : ''}
                    <a href="${asset.url}" target="_blank" rel="noopener noreferrer" class="generator-chip">Open</a>
                </div>
            </div>
        </article>
    `
        )
        .join('');
}

function syncFieldVisibility() {
    const mode = elements.generatorMode.value;
    const provider = elements.generatorProvider.value;
    const isLocalImageProvider = provider === 'swarm' || provider === 'comfy';

    elements.generatorProvider.disabled = mode !== 'image_generate';
    elements.generatorNegativePromptWrap.classList.toggle(
        'hidden',
        !(mode === 'image_generate' && isLocalImageProvider)
    );
    elements.generatorSourcePanel.classList.toggle('hidden', true);
    elements.generatorSwarmFields.classList.toggle(
        'hidden',
        !(mode === 'image_generate' && isLocalImageProvider)
    );
    elements.generatorEditFields.classList.toggle('hidden', true);
    elements.generatorVideoFields.classList.toggle('hidden', true);
}

function renderAll() {
    if (!elements) return;
    syncFieldVisibility();
    renderPresets();
    renderPromptTemplates();
    renderSourcePickers();
    renderSelectedSources();
    renderQueueSummary();
    renderQueueList();
    renderResults();
}

function readPrefsFromForm() {
    updatePrefs({
        mode: elements.generatorMode.value,
        provider: elements.generatorProvider.value,
        helperProvider: elements.generatorHelperProvider.value,
        prompt: elements.generatorPrompt.value,
        negativePrompt: elements.generatorNegativePrompt.value,
        batchCount: parseInt(elements.generatorBatchCount.value, 10) || 1,
        aspectRatio:
            elements.generatorMode.value === 'image_edit'
                ? elements.generatorEditAspectRatio.value
                : elements.generatorAspectRatio.value,
        imageResolution: elements.generatorImageResolution.value,
        editResolution: elements.generatorEditResolution.value,
        videoDuration: parseInt(elements.generatorVideoDuration.value, 10) || 4,
        videoAspectRatio: elements.generatorVideoAspectRatio.value,
        videoResolution: elements.generatorVideoResolution.value,
        swarmWidth: parseInt(elements.generatorSwarmWidth.value, 10) || 832,
        swarmHeight: parseInt(elements.generatorSwarmHeight.value, 10) || 1216,
        swarmSteps: parseInt(elements.generatorSwarmSteps.value, 10) || 25,
        swarmCfgScale: parseFloat(elements.generatorSwarmCfgScale.value) || 7,
        swarmSampler: elements.generatorSwarmSampler.value,
        swarmSeedMode: elements.generatorSwarmSeedMode.value,
        swarmBaseSeed: parseInt(elements.generatorSwarmBaseSeed.value, 10) || 1
    });
    renderAll();
}

function setHelperStatus(message, isError = false) {
    elements.generatorHelperStatus.textContent = message || '';
    elements.generatorHelperStatus.className = isError
        ? 'text-sm text-red-300'
        : 'text-sm text-gray-400';
}

function buildJobRequests() {
    const mode = state.generatorPrefs.mode;
    const provider = mode === 'image_generate' ? state.generatorPrefs.provider : null;
    const batchCount = Math.max(1, Math.min(4, parseInt(state.generatorPrefs.batchCount, 10) || 1));
    const jobs = [];
    const batchId = `batch_${Date.now()}`;

    if (mode !== 'image_generate') {
        throw new Error(`Unsupported generator mode: ${mode}`);
    }

    if (provider !== 'swarm' && provider !== 'comfy') {
        throw new Error(`Unsupported image provider: ${provider}`);
    }

    for (let index = 0; index < batchCount; index += 1) {
        jobs.push({
            batchId,
            mode,
            provider,
            prompt: state.generatorPrefs.prompt,
            negativePrompt: state.generatorPrefs.negativePrompt,
            providerModel: provider === 'comfy' ? 'comfyui' : 'swarmui',
            requestJson: {
                batchCount: 1,
                width: state.generatorPrefs.swarmWidth,
                height: state.generatorPrefs.swarmHeight,
                steps: state.generatorPrefs.swarmSteps,
                cfgScale: state.generatorPrefs.swarmCfgScale,
                sampler: normalizeSwarmSampler(state.generatorPrefs.swarmSampler),
                seedMode: state.generatorPrefs.swarmSeedMode,
                baseSeed:
                    state.generatorPrefs.swarmSeedMode === 'increment'
                        ? state.generatorPrefs.swarmBaseSeed + index
                        : state.generatorPrefs.swarmBaseSeed
            }
        });
    }

    return jobs;
}

async function patchAndStoreJob(jobId, patch) {
    const payload = await updateGeneratorJob(jobId, patch);
    if (payload.job) {
        upsertJobs([payload.job]);
    }
    if (Array.isArray(payload.assets) && payload.assets.length > 0) {
        upsertAssets(payload.assets);
    }
    renderAll();
    return payload;
}

async function resumePollingJob() {
    // Video polling removed — video generation depended on Grok API (issue #16)
}

async function processGeneratorQueue() {
    if (isQueueRunning) return;
    isQueueRunning = true;

    try {
        while (true) {
            const nextJob = [...state.generatorJobs]
                .filter((job) => job.status === 'queued')
                .sort((a, b) => a.id - b.id)[0];
            if (!nextJob) break;

            await patchAndStoreJob(nextJob.id, { status: 'running', errorMessage: null });

            try {
                const result = await executeGeneratorJob(nextJob);
                if (result.status === 'polling') {
                    await patchAndStoreJob(nextJob.id, {
                        status: 'polling',
                        providerRequestId: result.providerRequestId,
                        creditsCharged: result.creditsCharged || 0
                    });
                    resumePollingJob({
                        ...nextJob,
                        providerRequestId: result.providerRequestId,
                        requestJson: nextJob.requestJson
                    });
                    continue;
                }

                await patchAndStoreJob(nextJob.id, {
                    status: 'succeeded',
                    assets: result.assets,
                    creditsCharged: result.creditsCharged || 0
                });

                const generatedImageCount = Array.isArray(result.assets)
                    ? result.assets.filter((asset) => asset.mediaType === 'image').length
                    : 0;
                if (generatedImageCount > 0) {
                    recordGeneratedMedia({
                        provider: nextJob.provider,
                        prompt: nextJob.prompt,
                        source: 'generator',
                        amount: generatedImageCount
                    });
                    saveToLocalStorage();
                }
            } catch (error) {
                await patchAndStoreJob(nextJob.id, {
                    status: 'failed',
                    errorMessage: error.message
                });
            }
        }
    } finally {
        isQueueRunning = false;
    }
}

async function handleSubmit() {
    readPrefsFromForm();
    const jobsToCreate = buildJobRequests();
    const payload = await createGeneratorJobs(jobsToCreate);
    upsertJobs(payload.jobs || []);
    recordGeneratorBatch({
        provider: state.generatorPrefs.provider,
        prompt: state.generatorPrefs.prompt,
        batchCount: jobsToCreate.length
    });
    saveToLocalStorage();
    renderAll();
    processGeneratorQueue();
}

async function handlePromptHelper(action) {
    setHelperStatus('Working...');
    try {
        const result = await runPromptHelperAction({
            action,
            prompt: elements.generatorPrompt.value,
            negativePrompt: elements.generatorNegativePrompt.value,
            provider: elements.generatorHelperProvider.value
        });
        elements.generatorPrompt.value = String(result || '').trim();
        readPrefsFromForm();
        setHelperStatus('Prompt updated.');
    } catch (error) {
        setHelperStatus(error.message, true);
        if (/OpenRouter is not configured/i.test(error.message)) {
            toggleAdvancedSettings(true);
        }
    }
}

function addSource(source) {
    const limit = state.generatorPrefs.mode === 'image_edit' ? 3 : 1;
    const next = [...selectedSources, source];
    const deduped = [];
    const seen = new Set();
    next.forEach((item) => {
        const key = item.assetId ? `asset:${item.assetId}` : item.url;
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(item);
    });
    selectedSources = deduped.slice(-limit);
    renderSelectedSources();
}

function populateFromAsset(asset, mode) {
    if (!asset || asset.mediaType !== 'image') return;
    state.generatorPrefs.mode = mode;
    applyPrefsToForm();
    readPrefsFromForm();
    addSource({
        id: `asset_${asset.id}`,
        assetId: asset.id,
        url: asset.url,
        origin: 'generator',
        label: asset.prompt || `Generator asset #${asset.id}`
    });
}

async function retryAsset(assetId) {
    const asset = state.generatorAssets.find((item) => item.id === assetId);
    if (!asset) return;
    const sourceJob = state.generatorJobs.find((job) => job.id === asset.jobId);
    if (!sourceJob) return;

    const retryPayload = {
        batchId: `retry_${Date.now()}`,
        mode: sourceJob.mode,
        provider: sourceJob.provider,
        prompt: sourceJob.prompt,
        negativePrompt: sourceJob.negativePrompt || '',
        sourceAssetIds: sourceJob.sourceAssetIds || [],
        providerModel: sourceJob.providerModel || '',
        requestJson: sourceJob.requestJson || {}
    };

    const created = await createGeneratorJobs([retryPayload]);
    upsertJobs(created.jobs || []);
    renderAll();
    processGeneratorQueue();
}

function bindEvents() {
    elements.generatorMode.addEventListener('change', () => {
        selectedSources = [];
        readPrefsFromForm();
    });

    [
        elements.generatorProvider,
        elements.generatorPrompt,
        elements.generatorNegativePrompt,
        elements.generatorBatchCount,
        elements.generatorAspectRatio,
        elements.generatorImageResolution,
        elements.generatorEditResolution,
        elements.generatorVideoDuration,
        elements.generatorVideoAspectRatio,
        elements.generatorVideoResolution,
        elements.generatorSwarmWidth,
        elements.generatorSwarmHeight,
        elements.generatorSwarmSteps,
        elements.generatorSwarmCfgScale,
        elements.generatorSwarmSampler,
        elements.generatorSwarmSeedMode,
        elements.generatorSwarmBaseSeed,
        elements.generatorEditAspectRatio,
        elements.generatorHelperProvider
    ].filter(Boolean).forEach((input) => {
        input.addEventListener('input', readPrefsFromForm);
        input.addEventListener('change', readPrefsFromForm);
    });

    elements.generatorSubmitBtn.addEventListener('click', async () => {
        elements.generatorSubmitBtn.disabled = true;
        elements.generatorSubmitBtn.classList.add('opacity-60');
        try {
            await handleSubmit();
        } catch (error) {
            setHelperStatus(error.message, true);
        } finally {
            elements.generatorSubmitBtn.disabled = false;
            elements.generatorSubmitBtn.classList.remove('opacity-60');
        }
    });

    elements.generatorSourceUpload.addEventListener('change', async (event) => {
        const files = Array.from(event.target.files || []);
        for (const file of files) {
            const uploaded = await uploadFileForStorage(file);
            addSource({
                id: `upload_${Date.now()}_${file.name}`,
                assetId: null,
                url: uploaded.url,
                origin: 'upload',
                label: file.name
            });
        }
        event.target.value = '';
    });

    elements.addRecentSourceBtn.addEventListener('click', () => {
        const asset = state.generatorAssets.find(
            (item) => item.id === Number.parseInt(elements.generatorRecentSource.value, 10)
        );
        if (!asset) return;
        addSource({
            id: `asset_${asset.id}`,
            assetId: asset.id,
            url: asset.url,
            origin: 'generator',
            label: asset.prompt || `Generator asset #${asset.id}`
        });
    });

    elements.addGallerySourceBtn.addEventListener('click', () => {
        const item = state.galleryImages.find(
            (entry) => entry.id === elements.gallerySourcePicker.value
        );
        if (!item?.imageUrl) return;
        addSource({
            id: `gallery_${item.id}`,
            assetId: null,
            url: item.imageUrl,
            origin: 'gallery',
            label: item.characterName || 'Gallery image'
        });
    });

    elements.selectedGeneratorSources.addEventListener('click', (event) => {
        const removeBtn = event.target.closest('[data-remove-source]');
        if (!removeBtn) return;
        selectedSources = selectedSources.filter(
            (source) => source.id !== removeBtn.getAttribute('data-remove-source')
        );
        renderSelectedSources();
    });

    elements.generatorTemplateChips.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-template-chip]');
        if (!chip) return;
        elements.generatorPrompt.value = appendTemplateSnippet(
            elements.generatorPrompt.value,
            chip.getAttribute('data-template-chip')
        );
        readPrefsFromForm();
    });

    elements.promptHelperBtns.forEach((button) => {
        button.addEventListener('click', () =>
            handlePromptHelper(button.getAttribute('data-generator-helper-action'))
        );
    });

    elements.promptPresetSaveBtn.addEventListener('click', () => {
        const name = elements.generatorPresetName.value.trim();
        if (!name) {
            setHelperStatus('Preset name is required.', true);
            return;
        }

        const presets = Array.isArray(state.generatorPrefs.promptPresets)
            ? [...state.generatorPrefs.promptPresets]
            : [];
        presets.push({
            name,
            prompt: elements.generatorPrompt.value,
            negativePrompt: elements.generatorNegativePrompt.value,
            mode: elements.generatorMode.value,
            provider: elements.generatorProvider.value
        });
        updatePrefs({ promptPresets: presets });
        elements.generatorPresetName.value = '';
        renderPresets();
        setHelperStatus('Preset saved.');
    });

    elements.promptPresetApplyBtn.addEventListener('click', async () => {
        const presetIndex = Number.parseInt(elements.generatorPresets.value, 10);
        if (!Number.isFinite(presetIndex)) return;
        const preset = state.generatorPrefs.promptPresets?.[presetIndex];
        if (!preset) return;

        elements.generatorMode.value = preset.mode || 'image_generate';
        elements.generatorProvider.value = preset.provider || 'swarm';
        elements.generatorPrompt.value = preset.prompt || '';
        elements.generatorNegativePrompt.value = preset.negativePrompt || '';
        readPrefsFromForm();
        setHelperStatus('Preset applied.');
    });

    elements.generatorResults.addEventListener('click', async (event) => {
        const actionBtn = event.target.closest('[data-result-action]');
        if (!actionBtn) return;

        const assetId = Number.parseInt(actionBtn.getAttribute('data-asset-id'), 10);
        const asset = state.generatorAssets.find((item) => item.id === assetId);
        if (!asset) return;

        const action = actionBtn.getAttribute('data-result-action');
        if (action === 'edit') {
            populateFromAsset(asset, 'image_edit');
            return;
        }
        if (action === 'video') {
            populateFromAsset(asset, 'video_generate');
            return;
        }
        if (action === 'reuse-prompt') {
            elements.generatorPrompt.value = asset.prompt || '';
            readPrefsFromForm();
            return;
        }
        if (action === 'reuse-source') {
            const sourceJob = state.generatorJobs.find((job) => job.id === asset.jobId);
            const sourceUrl = sourceJob?.requestJson?.sourceUrls?.[0];
            if (!sourceUrl) return;
            elements.generatorMode.value = 'video_generate';
            applyPrefsToForm();
            readPrefsFromForm();
            addSource({
                id: `video_source_${asset.id}`,
                assetId: null,
                url: sourceUrl,
                origin: 'generator',
                label: sourceJob?.prompt || 'Reused source'
            });
            return;
        }
        if (action === 'retry') {
            await retryAsset(assetId);
        }
    });
}

export async function loadGeneratorHistory() {
    const [jobsPayload, assetsPayload] = await Promise.all([
        fetchGeneratorJobs({ limit: 80 }),
        fetchGeneratorAssets({ limit: 80 })
    ]);

    state.generatorJobs = jobsPayload.jobs || [];
    state.generatorAssets = assetsPayload.assets || [];
}

async function resumePendingJobs() {
    const pollingJobs = state.generatorJobs.filter(
        (job) => job.status === 'polling' && job.providerRequestId
    );
    const interruptedJobs = state.generatorJobs.filter(
        (job) => job.status === 'running' && !job.providerRequestId
    );

    for (const job of interruptedJobs) {
        await patchAndStoreJob(job.id, {
            status: 'interrupted',
            errorMessage: 'The page reloaded before the job completed. Retry to run it again.'
        });
    }

    pollingJobs.forEach((job) => {
        resumePollingJob(job);
    });
}

export async function initGenerator() {
    if (initialized) return;
    elements = getElements();
    if (!elements.generatorView) return;

    applyPrefsToForm();
    bindEvents();
    await loadGeneratorHistory();
    renderAll();
    await resumePendingJobs();

    initialized = true;
}

export function refreshGeneratorView() {
    if (!initialized) return;
    renderAll();
}
