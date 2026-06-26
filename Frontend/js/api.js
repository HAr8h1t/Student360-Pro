const API_BASE_URL = '/api';
let csrfToken = null;

async function getCSRFToken() {
    if (!csrfToken) {
        try {
            const response = await fetch(`${API_BASE_URL}/csrf-token`);
            const data = await response.json();
            csrfToken = data.csrf_token;
        } catch (error) {
            console.error("Failed to get CSRF token:", error);
        }
    }
    return csrfToken;
}

async function fetchWithCSRF(url, options = {}) {
    const token = await getCSRFToken();
    const headers = {
        ...options.headers,
        'X-CSRFToken': token
    };
    
    return fetch(url, {
        ...options,
        headers,
        credentials: 'same-origin' // Important for session cookies
    });
}

async function callGeminiApi(prompt) {
    // This function now calls our secure backend proxy
    try {
        const response = await fetchWithCSRF(`${API_BASE_URL}/gemini-proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("API Proxy Error:", errorData);
            const errorMessage = errorData.details?.error?.message || 'Unknown AI service error.';
            if (errorMessage.includes("API key not valid")) {
                 showToast('Invalid Gemini API Key. Please update it in the backend .env file.', 'error');
                 return "Error: The Gemini API key configured on the server is not valid.";
            }
            throw new Error(`API Error: ${response.status} - ${errorMessage}`);
        }

        const result = await response.json();
        
        if (result.candidates && result.candidates[0]?.content?.parts[0]) {
            return result.candidates[0].content.parts[0].text;
        }
        return "Sorry, I couldn't generate a response. The AI returned an empty result.";

    } catch (error) {
        console.error("Gemini proxy call failed:", error);
        return `An error occurred while contacting the AI: ${error.message}. Please check the backend console for details.`;
    }
}

export { API_BASE_URL, fetchWithCSRF, callGeminiApi };
