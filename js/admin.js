import { elements } from './dom.js';
import { state } from './state.js';

function isAdminUser() {
    return Boolean(state.currentUser?.isAdmin);
}

async function parseJsonResponse(response) {
    return response.json().catch(() => ({}));
}

function setAdminStatus(message, isError = false) {
    if (!elements.adminUsersStatus) return;
    elements.adminUsersStatus.textContent = message;
    elements.adminUsersStatus.className = `text-xs mb-3 ${isError ? 'text-red-400' : 'text-gray-500'}`;
}

function setRefreshButtonLoading(isLoading) {
    if (!elements.refreshUsersBtn) return;
    elements.refreshUsersBtn.disabled = isLoading;
    elements.refreshUsersBtn.textContent = isLoading ? 'Loading...' : 'Refresh Users';
}

function normalizeUser(user) {
    const id = Number.parseInt(user?.id, 10);
    const username = String(user?.username || 'unknown');
    const parsedCredits = Number(user?.credits);
    const credits = Number.isFinite(parsedCredits) ? Math.max(0, Math.trunc(parsedCredits)) : 0;
    const isAdmin = Boolean(user?.isAdmin);

    return { id, username, credits, isAdmin };
}

function sortUsersByName(users) {
    users.sort((a, b) => a.username.localeCompare(b.username));
}

function renderUserRow(user) {
    const row = document.createElement('div');
    row.className = 'p-3 rounded-lg bg-black/20 border border-purple-900/30';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between gap-3 mb-2';

    const nameWrap = document.createElement('div');
    nameWrap.className = 'flex items-center gap-2 min-w-0';

    const username = document.createElement('p');
    username.className = 'text-sm font-medium text-gray-200 truncate';
    username.textContent = `@${user.username}`;
    nameWrap.appendChild(username);

    if (user.isAdmin) {
        const adminTag = document.createElement('span');
        adminTag.className = 'text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-900/40 border border-amber-700/50 text-amber-300';
        adminTag.textContent = 'Admin';
        nameWrap.appendChild(adminTag);
    }

    const creditsText = document.createElement('span');
    creditsText.className = 'text-xs text-gray-400 flex-shrink-0';
    creditsText.textContent = `Current: ${user.credits}`;

    header.appendChild(nameWrap);
    header.appendChild(creditsText);

    const controls = document.createElement('div');
    controls.className = 'flex items-center gap-2';

    const creditsInput = document.createElement('input');
    creditsInput.type = 'number';
    creditsInput.min = '0';
    creditsInput.step = '1';
    creditsInput.value = String(user.credits);
    creditsInput.dataset.userId = String(user.id);
    creditsInput.className = 'w-28 px-3 py-1.5 rounded-lg text-sm';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.dataset.userId = String(user.id);
    saveBtn.className = 'admin-save-credits-btn px-3 py-1.5 btn-secondary rounded-lg text-sm font-medium';
    saveBtn.textContent = 'Update';

    controls.appendChild(creditsInput);
    controls.appendChild(saveBtn);

    row.appendChild(header);
    row.appendChild(controls);
    return row;
}

function renderAdminUsers(users) {
    if (!elements.adminUsersList) return;
    elements.adminUsersList.innerHTML = '';

    if (!Array.isArray(users) || users.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-xs text-gray-500';
        empty.textContent = 'No users found.';
        elements.adminUsersList.appendChild(empty);
        return;
    }

    users.forEach((user) => {
        elements.adminUsersList.appendChild(renderUserRow(user));
    });
}

export function syncAdminPanelVisibility() {
    if (!elements.adminPanel) return;

    if (isAdminUser()) {
        elements.adminPanel.classList.remove('hidden');
        setAdminStatus('Use this panel to update user credits.');
        return;
    }

    elements.adminPanel.classList.add('hidden');
    state.adminUsers = [];
    if (elements.adminUsersList) {
        elements.adminUsersList.innerHTML = '';
    }
}

export async function fetchAdminUsers(silent = false) {
    if (!isAdminUser()) return [];

    setRefreshButtonLoading(true);
    setAdminStatus('Loading users...');

    try {
        const response = await fetch('/api/admin/users', {
            method: 'GET',
            cache: 'no-store'
        });
        const data = await parseJsonResponse(response);
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load users.');
        }

        const users = Array.isArray(data.users)
            ? data.users
                .map(normalizeUser)
                .filter((user) => Number.isFinite(user.id) && user.id > 0)
            : [];

        sortUsersByName(users);
        state.adminUsers = users;
        renderAdminUsers(users);
        setAdminStatus(`Loaded ${users.length} users.`);
        return users;
    } catch (error) {
        console.error('Failed to fetch admin users:', error);
        setAdminStatus(`Failed to load users: ${error.message}`, true);
        if (!silent) {
            alert(`Failed to load users: ${error.message}`);
        }
        throw error;
    } finally {
        setRefreshButtonLoading(false);
    }
}

async function updateUserCredits(userId, credits) {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/credits`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ credits })
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
        throw new Error(data.error || 'Failed to update credits.');
    }

    const updatedUser = normalizeUser(data.user);
    const index = state.adminUsers.findIndex((user) => user.id === updatedUser.id);
    if (index !== -1) {
        state.adminUsers[index] = updatedUser;
    } else {
        state.adminUsers.push(updatedUser);
    }

    sortUsersByName(state.adminUsers);
    renderAdminUsers(state.adminUsers);
    setAdminStatus(`Updated credits for @${updatedUser.username}.`);

    if (state.currentUser && state.currentUser.id === updatedUser.id) {
        state.currentUser.credits = updatedUser.credits;
        state.currentUser.isAdmin = updatedUser.isAdmin;
        if (elements.currentCredits) {
            elements.currentCredits.textContent = String(updatedUser.credits);
        }
    }

    return updatedUser;
}

export async function handleAdminUsersListClick(event) {
    if (!isAdminUser() || !elements.adminUsersList) return;

    const button = event.target.closest('.admin-save-credits-btn');
    if (!button || !elements.adminUsersList.contains(button)) return;

    const userId = Number.parseInt(button.dataset.userId, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
        alert('Invalid user selected.');
        return;
    }

    const input = elements.adminUsersList.querySelector(`input[data-user-id="${userId}"]`);
    if (!input) {
        alert('Could not find credits input for selected user.');
        return;
    }

    const credits = Number(input.value);
    if (!Number.isInteger(credits) || credits < 0) {
        alert('Credits must be a whole number that is 0 or higher.');
        input.focus();
        return;
    }

    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving...';

    try {
        await updateUserCredits(userId, credits);
    } catch (error) {
        console.error('Failed to update user credits:', error);
        alert(`Failed to update credits: ${error.message}`);
    } finally {
        if (button.isConnected) {
            button.disabled = false;
            button.textContent = originalLabel;
        }
    }
}
