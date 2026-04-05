export function isRemoteSwarmJob(job) {
    return job?.provider === 'swarm' && job?.mode === 'image_generate';
}

export function shouldExecuteGeneratorJobLocally(job) {
    return !isRemoteSwarmJob(job);
}

export function shouldMarkGeneratorJobInterruptedOnReload(job) {
    return job?.status === 'running' && shouldExecuteGeneratorJobLocally(job);
}
