// static/js/api.js

async function apiFetch(url, options = {}) {
    options.headers = window.getAuthHeaders();
    const response = await fetch(url, options);
    if (window.handleAuthError(response)) return null;
    return response;
}
