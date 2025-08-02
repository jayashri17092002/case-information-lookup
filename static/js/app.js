// Court Lookup - JavaScript Application

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Populate filing years
    populateFilingYears();
    
    // Load initial CAPTCHA
    loadCaptcha();
    
    // Attach event listeners
    attachEventListeners();
    
    // Load initial history
    loadQueryHistory();
    
    // Auto-refresh history every 30 seconds
    setInterval(loadQueryHistory, 30000);
}

function populateFilingYears() {
    const filingYearSelect = document.getElementById('filingYear');
    if (!filingYearSelect) return;
    
    const currentYear = new Date().getFullYear();
    
    // Clear existing options except the first one
    filingYearSelect.innerHTML = '<option value="">Select Year</option>';
    
    // Add years from current year to 20 years back
    for (let year = currentYear; year >= currentYear - 20; year--) {
        const option = document.createElement('option');
        option.value = year.toString();
        option.textContent = year.toString();
        filingYearSelect.appendChild(option);
    }
}

function attachEventListeners() {
    // Search form submission
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', handleSearch);
    }
    
    // Clear form button
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearForm);
    }
    
    // CAPTCHA refresh button
    const refreshCaptchaBtn = document.getElementById('refreshCaptchaBtn');
    if (refreshCaptchaBtn) {
        refreshCaptchaBtn.addEventListener('click', refreshInlineCaptcha);
    }
    
    // Audio CAPTCHA button
    const audioCaptchaBtn = document.getElementById('audioCaptchaBtn');
    if (audioCaptchaBtn) {
        audioCaptchaBtn.addEventListener('click', playAudioCaptcha);
    }
    
    // History filter
    const historyFilter = document.getElementById('historyFilter');
    if (historyFilter) {
        historyFilter.addEventListener('change', loadQueryHistory);
    }
    
    // Export button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportHistory);
    }
    
    // Keyboard shortcuts for accessibility
    document.addEventListener('keydown', function(event) {
        // Alt + A for audio CAPTCHA
        if (event.altKey && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            playAudioCaptcha();
        }
        
        // Alt + R for refresh CAPTCHA
        if (event.altKey && event.key.toLowerCase() === 'r') {
            event.preventDefault();
            refreshInlineCaptcha();
        }
    });
}

async function loadCaptcha() {
    try {
        const response = await fetch('/api/captcha');
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('captchaText').textContent = result.captchaText;
            document.getElementById('captchaSessionId').value = result.sessionId;
            
            // Store CAPTCHA data globally for later use
            window.currentCaptchaData = {
                sessionId: result.sessionId,
                timestamp: result.timestamp,
                expiresIn: result.expiresIn
            };
        } else {
            document.getElementById('captchaText').textContent = 'Error';
            console.error('Failed to load CAPTCHA:', result.error);
        }
    } catch (error) {
        document.getElementById('captchaText').textContent = 'Error';
        console.error('CAPTCHA loading error:', error);
    }
}

async function refreshInlineCaptcha() {
    const refreshBtn = document.getElementById('refreshCaptchaBtn');
    const icon = refreshBtn.querySelector('i');
    
    try {
        // Show loading state
        icon.classList.remove('fa-sync-alt');
        icon.classList.add('fa-spinner', 'fa-spin');
        refreshBtn.disabled = true;
        
        const response = await fetch('/api/captcha');
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('captchaText').textContent = result.captchaText;
            document.getElementById('captchaSessionId').value = result.sessionId;
            document.getElementById('captchaInput').value = '';
            
            // Update global CAPTCHA data
            window.currentCaptchaData = {
                sessionId: result.sessionId,
                timestamp: result.timestamp,
                expiresIn: result.expiresIn
            };
            
            // Silent refresh - no notification needed
        } else {
            showToast('Refresh Failed', result.error || 'Unable to refresh CAPTCHA', 'danger');
        }
    } catch (error) {
        console.error('CAPTCHA refresh error:', error);
        showToast('Network Error', 'Unable to refresh CAPTCHA. Please try again.', 'danger');
    } finally {
        // Reset button state
        icon.classList.remove('fa-spinner', 'fa-spin');
        icon.classList.add('fa-sync-alt');
        refreshBtn.disabled = false;
    }
}

function playAudioCaptcha() {
    const captchaText = document.getElementById('captchaText').textContent;
    const audioBtn = document.getElementById('audioCaptchaBtn');
    const icon = audioBtn.querySelector('i');
    
    // Check if browser supports speech synthesis
    if (!('speechSynthesis' in window)) {
        showToast('Audio Not Supported', 'Your browser does not support audio CAPTCHA functionality.', 'warning');
        return;
    }
    
    // Check if CAPTCHA text is available
    if (!captchaText || captchaText === 'Loading...' || captchaText === 'Error') {
        showToast('No CAPTCHA Available', 'Please wait for CAPTCHA to load or refresh it.', 'warning');
        return;
    }
    
    try {
        // Show playing state
        icon.classList.remove('fa-volume-up');
        icon.classList.add('fa-volume-high', 'fa-beat');
        audioBtn.classList.add('playing');
        audioBtn.disabled = true;
        
        // Stop any currently playing speech
        window.speechSynthesis.cancel();
        
        // Create speech utterance
        const utterance = new SpeechSynthesisUtterance();
        
        // Format CAPTCHA text for better audio clarity
        const spokenText = captchaText.split('').join(' '); // Add spaces between characters
        utterance.text = `CAPTCHA code: ${spokenText}. Please enter: ${spokenText}`;
        
        // Configure speech settings
        utterance.rate = 0.6; // Slower speech rate for clarity
        utterance.pitch = 1.0; // Normal pitch
        utterance.volume = 0.8; // Slightly lower volume
        
        // Set voice preference (try to use a clear English voice)
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(voice => 
            voice.lang.startsWith('en') && 
            (voice.name.includes('Google') || voice.name.includes('Microsoft') || voice.name.includes('Alex'))
        ) || voices.find(voice => voice.lang.startsWith('en')) || voices[0];
        
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
        
        // Handle speech events
        utterance.onstart = function() {
            showToast('Playing Audio', 'CAPTCHA code is being read aloud...', 'info');
        };
        
        utterance.onend = function() {
            // Reset button state
            icon.classList.remove('fa-volume-high', 'fa-beat');
            icon.classList.add('fa-volume-up');
            audioBtn.classList.remove('playing');
            audioBtn.disabled = false;
            
            // Focus on input field after audio
            const captchaInput = document.getElementById('captchaInput');
            if (captchaInput) {
                captchaInput.focus();
            }
        };
        
        utterance.onerror = function(event) {
            console.error('Speech synthesis error:', event.error);
            showToast('Audio Error', 'Unable to play audio CAPTCHA. Please try again.', 'danger');
            
            // Reset button state
            icon.classList.remove('fa-volume-high', 'fa-beat');
            icon.classList.add('fa-volume-up');
            audioBtn.classList.remove('playing');
            audioBtn.disabled = false;
        };
        
        // Start speaking
        window.speechSynthesis.speak(utterance);
        
    } catch (error) {
        console.error('Audio CAPTCHA error:', error);
        showToast('Audio Error', 'Unable to play audio CAPTCHA. Please try again.', 'danger');
        
        // Reset button state
        icon.classList.remove('fa-volume-high', 'fa-beat');
        icon.classList.add('fa-volume-up');
        audioBtn.classList.remove('playing');
        audioBtn.disabled = false;
    }
}

async function handleSearch(event) {
    event.preventDefault();
    
    // Prevent double submission
    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn && submitBtn.disabled) {
        return; // Already processing
    }
    
    // Disable submit button during processing
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Processing...';
    }
    
    const formData = new FormData(event.target);
    const captchaInput = document.getElementById('captchaInput').value.trim();
    const captchaSessionId = document.getElementById('captchaSessionId').value;
    
    const searchData = {
        caseType: formData.get('caseType'),
        caseNumber: formData.get('caseNumber'),
        filingYear: formData.get('filingYear'),
        court: 'high-court' // Default since we removed court selection
    };
    
    // Helper function to reset submit button
    const resetSubmitButton = () => {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-search me-2"></i>Search Case Details';
        }
    };
    
    // Validate form
    if (!searchData.caseType || !searchData.caseNumber || !searchData.filingYear) {
        showToast('Validation Error', 'Please fill in all required fields.', 'warning');
        resetSubmitButton();
        return;
    }
    
    // Validate CAPTCHA
    if (!captchaInput) {
        showToast('CAPTCHA Required', 'Please enter the CAPTCHA code to continue.', 'warning');
        document.getElementById('captchaInput').focus();
        resetSubmitButton();
        return;
    }
    
    if (captchaInput.length < 3) {
        showToast('Invalid CAPTCHA', 'CAPTCHA must be at least 3 characters.', 'warning');
        document.getElementById('captchaInput').focus();
        resetSubmitButton();
        return;
    }
    
    try {
        // Submit CAPTCHA and search data WITHOUT showing loading modal first
        const response = await fetch('/api/cases/captcha-submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                captchaSolution: captchaInput,
                formData: {
                    sessionId: captchaSessionId,
                    timestamp: window.currentCaptchaData?.timestamp,
                    captchaToken: `token_${window.currentCaptchaData?.timestamp}`
                },
                originalParams: searchData
            })
        });
        
        const result = await response.json();
        
        // Check if CAPTCHA validation failed immediately
        if (result.requiresNewCaptcha) {
            // Show orange error popup for wrong CAPTCHA - NO automatic refresh
            showToast('Invalid CAPTCHA', result.error || 'Wrong CAPTCHA entered. Please try again.', 'warning');
            document.getElementById('captchaInput').focus();
            document.getElementById('captchaInput').select(); // Select all text for easy replacement
            resetSubmitButton();
            return;
        }
        
        // If CAPTCHA was correct, NOW show loading for the actual search
        if (!result.success && !result.requiresNewCaptcha) {
            // Case not found or other search error (CAPTCHA was correct)
            showToast('Search Failed', result.error || 'Case not found in database', 'danger');
            resetSubmitButton();
            return;
        }
        
        // CAPTCHA was correct and case search is in progress
        if (result.success) {
            // Show loading only for successful CAPTCHA validation
            showLoadingModal('Searching Database', 'CAPTCHA verified! Searching court database...');
            
            // Hide loading after short delay and show redirect notification
            setTimeout(() => {
                hideLoadingModal();
                showToast('Redirecting to Case Details', 'Case found! Taking you to the case information page...', 'success');
                
                // Clear form
                clearForm();
                
                // Refresh CAPTCHA for next search
                refreshInlineCaptcha();
                
                // Refresh history
                loadQueryHistory();
                
                // Redirect to case details
                setTimeout(() => {
                    window.location.href = `/case/${result.queryId}`;
                }, 1500);
            }, 2000);
        }
        
    } catch (error) {
        console.error('Search error:', error);
        showToast('Network Error', 'Unable to complete search. Please try again.', 'danger');
        
        // Reset submit button on error
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-search me-2"></i>Search Case Details';
        }
    }
}

// Updated performCaseSearch to work with inline CAPTCHA
async function performCaseSearch(searchData) {
    try {
        const response = await fetch('/api/cases/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(searchData)
        });
        
        const result = await response.json();
        
        hideLoadingModal();
        
        if (!response.ok) {
            if (response.status === 429) {
                showToast('Rate Limit Exceeded', result.error || 'Too many requests. Please wait before searching again.', 'warning');
            } else {
                showToast('Search Failed', result.error || 'Failed to initiate search. Please try again.', 'danger');
            }
            return;
        }
        
        // Check if CAPTCHA is required (which it always is for court websites)
        if (result.requiresCaptcha) {
            showCaptchaModal(result, searchData);
            return;
        }
        
        showToast('Search Initiated', 'Your case search has been started. Redirecting to results...', 'success');
        
        // Wait a moment then redirect to case details
        setTimeout(() => {
            window.location.href = `/case/${result.queryId}`;
        }, 1500);
        
        // Refresh history
        loadQueryHistory();
        
    } catch (error) {
        hideLoadingModal();
        console.error('Search error:', error);
        showToast('Network Error', 'Unable to connect to the server. Please check your internet connection and try again.', 'danger');
    }
}

function clearForm() {
    const form = document.getElementById('searchForm');
    if (form) {
        form.reset();
    }
    
    // Clear CAPTCHA input
    const captchaInput = document.getElementById('captchaInput');
    if (captchaInput) {
        captchaInput.value = '';
    }
    
    // Refresh CAPTCHA for next search
    refreshInlineCaptcha();
    
    // Silent form clear - no notification needed
}

async function loadQueryHistory() {
    const historyContent = document.getElementById('historyContent');
    const historyLoading = document.getElementById('historyLoading');
    
    if (!historyContent) return;
    
    try {
        // Show loading
        if (historyLoading) {
            historyLoading.style.display = 'block';
        }
        
        const filter = document.getElementById('historyFilter')?.value || '24h';
        const response = await fetch(`/api/cases/history?filter=${filter}&limit=50`);
        
        if (!response.ok) {
            throw new Error('Failed to load history');
        }
        
        const history = await response.json();
        
        // Hide loading
        if (historyLoading) {
            historyLoading.style.display = 'none';
        }
        
        renderHistory(history);
        
    } catch (error) {
        console.error('History loading error:', error);
        if (historyLoading) {
            historyLoading.style.display = 'none';
        }
        
        historyContent.innerHTML = `
            <div class="text-center py-4">
                <i class="fas fa-exclamation-triangle text-warning mb-2" style="font-size: 2rem;"></i>
                <p class="text-muted">Failed to load query history. Please try again.</p>
                <button class="btn btn-outline-primary btn-sm" onclick="loadQueryHistory()">
                    <i class="fas fa-refresh me-1"></i> Retry
                </button>
            </div>
        `;
    }
}

function renderHistory(history) {
    const historyContent = document.getElementById('historyContent');
    if (!historyContent) return;
    
    if (history.length === 0) {
        historyContent.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-history text-muted mb-3" style="font-size: 3rem;"></i>
                <h5 class="text-muted">No Search History</h5>
                <p class="text-muted">Your case searches will appear here.</p>
            </div>
        `;
        return;
    }
    
    const historyHtml = `
        <div class="table-responsive">
            <table class="table table-hover history-table mb-0">
                <thead>
                    <tr>
                        <th>Case Details</th>
                        <th>Court</th>
                        <th>Status</th>
                        <th>Search Date</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${history.map(query => `
                        <tr>
                            <td>
                                <div class="fw-bold">${query.caseNumber}</div>
                                <small class="text-muted">${formatCaseType(query.caseType)} • ${query.filingYear}</small>
                            </td>
                            <td>
                                <span class="badge bg-light text-dark">
                                    ${query.court === 'high-court' ? 'High Court' : 'District Court'}
                                </span>
                            </td>
                            <td>
                                <span class="status-badge status-${query.status}">
                                    ${formatStatus(query.status)}
                                </span>
                            </td>
                            <td>
                                <div>${formatDate(query.createdAt)}</div>
                                <small class="text-muted">${formatTime(query.createdAt)}</small>
                            </td>
                            <td>
                                ${query.status === 'success' ? 
                                    `<a href="/case/${query.id}" class="btn btn-sm btn-outline-primary">
                                        <i class="fas fa-eye me-1"></i> View
                                    </a>` :
                                    query.status === 'pending' ?
                                    `<button class="btn btn-sm btn-outline-secondary" disabled>
                                        <i class="fas fa-clock me-1"></i> Processing
                                    </button>` :
                                    `<button class="btn btn-sm btn-outline-danger" disabled>
                                        <i class="fas fa-times me-1"></i> Failed
                                    </button>`
                                }
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    historyContent.innerHTML = historyHtml;
}

function formatCaseType(caseType) {
    const types = {
        'civil': 'Civil Case',
        'criminal': 'Criminal Case',
        'writ': 'Writ Petition',
        'appeal': 'Appeal',
        'revision': 'Revision',
        'execution': 'Execution'
    };
    return types[caseType] || caseType;
}

function formatStatus(status) {
    const statuses = {
        'pending': 'Processing',
        'success': 'Completed',
        'failed': 'Failed'
    };
    return statuses[status] || status;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function exportHistory() {
    const historyFilter = document.getElementById('historyFilter')?.value || '24h';
    const exportUrl = `/api/cases/history/export?filter=${historyFilter}`;
    
    // Create a temporary link to download
    const link = document.createElement('a');
    link.href = exportUrl;
    link.download = `case_history_${historyFilter}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Export Started', 'Your history is being downloaded.', 'info');
}

// Modal and Toast Functions
function showLoadingModal(title, message) {
    const modal = document.getElementById('loadingModal');
    const titleElement = document.getElementById('loadingTitle');
    const messageElement = document.getElementById('loadingMessage');
    
    if (titleElement) titleElement.textContent = title;
    if (messageElement) messageElement.textContent = message;
    
    if (modal) {
        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();
    }
}

function hideLoadingModal() {
    const modal = document.getElementById('loadingModal');
    if (modal) {
        const bootstrapModal = bootstrap.Modal.getInstance(modal);
        if (bootstrapModal) {
            bootstrapModal.hide();
        }
    }
}

function showToast(title, message, type = 'info') {
    const toastElement = document.getElementById('alertToast');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');
    
    if (!toastElement) return;
    
    // Set title and message
    if (toastTitle) toastTitle.textContent = title;
    if (toastMessage) toastMessage.textContent = message;
    
    // Update toast styling based on type
    const toastHeader = toastElement.querySelector('.toast-header');
    const icon = toastHeader?.querySelector('i');
    
    if (toastHeader && icon) {
        // Reset classes
        toastHeader.className = 'toast-header';
        icon.className = 'fas me-2';
        
        // Apply type-specific styling
        switch (type) {
            case 'success':
                toastHeader.classList.add('bg-success', 'text-white');
                icon.classList.add('fa-check-circle');
                break;
            case 'warning':
                toastHeader.classList.add('bg-warning', 'text-dark');
                icon.classList.add('fa-exclamation-triangle');
                break;
            case 'danger':
                toastHeader.classList.add('bg-danger', 'text-white');
                icon.classList.add('fa-times-circle');
                break;
            default:
                toastHeader.classList.add('bg-info', 'text-white');
                icon.classList.add('fa-info-circle');
        }
    }
    
    // Show toast
    const toast = new bootstrap.Toast(toastElement, {
        autohide: true,
        delay: type === 'danger' ? 8000 : 5000
    });
    toast.show();
}

// Utility Functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Error Handling
window.addEventListener('error', function(event) {
    console.error('JavaScript error:', event.error);
    showToast('Application Error', 'An unexpected error occurred. Please refresh the page.', 'danger');
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
});

// CAPTCHA Modal Functions
function showCaptchaModal(captchaData, originalSearchData) {
    const modalHtml = `
        <div class="modal fade" id="captchaModal" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-shield-alt text-warning me-2"></i>
                            CAPTCHA Verification Required
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            ${captchaData.instructions ? captchaData.instructions.join('<br>') : 'Please solve the CAPTCHA to continue'}
                        </div>
                        
                        <div class="text-center mb-3">
                            <div class="d-flex justify-content-center align-items-center gap-2 mb-2">
                                <img id="captchaImage" 
                                     src="${captchaData.captchaImageUrl}" 
                                     alt="CAPTCHA Image" 
                                     class="border rounded p-2"
                                     style="max-width: 200px; background: white;">
                                <button type="button" 
                                        class="btn btn-outline-secondary btn-sm" 
                                        onclick="refreshCaptchaImage()"
                                        title="Get a fresh CAPTCHA">
                                    <i class="fas fa-sync-alt"></i> Refresh
                                </button>
                            </div>
                            <small class="text-muted">
                                <i class="fas fa-lightbulb"></i> 
                                Can't read it? Click refresh for a new CAPTCHA
                            </small>
                        </div>
                        
                        <div class="mb-3">
                            <label for="captchaSolution" class="form-label">Enter CAPTCHA Text:</label>
                            <input type="text" 
                                   class="form-control" 
                                   id="captchaSolution" 
                                   placeholder="Enter the text from image above"
                                   autocomplete="off"
                                   style="font-family: monospace; font-size: 1.1em; letter-spacing: 2px;">
                            <div class="form-text">
                                <i class="fas fa-info-circle"></i> 
                                Enter exactly as shown (case-insensitive)
                            </div>
                        </div>
                        
                        <div class="text-muted small">
                            <i class="fas fa-clock me-1"></i>
                            This CAPTCHA will expire in 10 minutes. Session: <span id="captchaSessionId">${captchaData.formData?.sessionId || 'N/A'}</span>
                        </div>
                    </div>
                    
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-1"></i>Cancel
                        </button>
                        <button type="button" class="btn btn-primary" onclick="submitCaptcha()">
                            <i class="fas fa-check me-1"></i>Verify & Continue
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if present
    const existingModal = document.getElementById('captchaModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Store data for submission
    window.captchaData = captchaData;
    window.originalSearchData = originalSearchData;
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('captchaModal'));
    modal.show();
    
    // Focus on input
    setTimeout(() => {
        document.getElementById('captchaSolution').focus();
    }, 500);
}

async function submitCaptcha() {
    const captchaSolution = document.getElementById('captchaSolution').value.trim();
    
    if (!captchaSolution) {
        showToast('Validation Error', 'Please enter the CAPTCHA text', 'warning');
        return;
    }
    
    if (captchaSolution.length < 3) {
        showToast('Validation Error', 'CAPTCHA must be at least 3 characters', 'warning');
        return;
    }
    
    try {
        showLoadingModal('Verifying CAPTCHA', 'Processing verification and continuing search...');
        
        const response = await fetch('/api/cases/captcha-submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                captchaSolution: captchaSolution,
                formData: window.captchaData.formData,
                originalParams: window.originalSearchData
            })
        });
        
        const result = await response.json();
        
        hideLoadingModal();
        
        // Close CAPTCHA modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('captchaModal'));
        modal.hide();
        
        if (result.success) {
            showToast('CAPTCHA Verified', 'Verification successful! Redirecting to case details...', 'success');
            
            // Refresh history
            loadQueryHistory();
            
            // Redirect to case details
            setTimeout(() => {
                window.location.href = `/case/${result.queryId}`;
            }, 1500);
        } else if (result.requiresNewCaptcha) {
            // CAPTCHA was wrong - show error and restart search for fresh CAPTCHA
            showToast('Invalid CAPTCHA', result.error, 'danger');
            
            setTimeout(() => {
                // Close current modal and restart search to get fresh CAPTCHA
                const modal = bootstrap.Modal.getInstance(document.getElementById('captchaModal'));
                if (modal) modal.hide();
                
                // Restart search with same parameters
                if (window.originalSearchData) {
                    performCaseSearch(window.originalSearchData);
                }
            }, 2000);
        } else {
            showToast('Verification Failed', result.error || 'CAPTCHA verification failed', 'danger');
        }
        
    } catch (error) {
        hideLoadingModal();
        console.error('CAPTCHA submission error:', error);
        showToast('Network Error', 'Unable to verify CAPTCHA. Please try again.', 'danger');
    }
}

// Enhanced PDF Download with error handling
function downloadDocument(docId, title) {
    showLoadingModal('Preparing Download', 'Generating PDF document...');
    
    const downloadUrl = `/api/documents/${docId}/download`;
    
    // Create temporary link for download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    
    // Handle download
    link.onclick = function() {
        setTimeout(() => {
            hideLoadingModal();
            showToast('Download Started', 'PDF document download has begun', 'success');
        }, 1000);
    };
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Fallback error handling
    setTimeout(() => {
        hideLoadingModal();
    }, 3000);
}

// Refresh CAPTCHA Function
async function refreshCaptchaImage() {
    try {
        const refreshButton = document.querySelector("[onclick=\"refreshCaptchaImage()\"]");
        const icon = refreshButton?.querySelector("i");
        
        // Show loading state
        if (icon) {
            icon.classList.remove("fa-sync-alt");
            icon.classList.add("fa-spinner", "fa-spin");
        }
        refreshButton.disabled = true;
        
        showToast("Refreshing CAPTCHA", "Generating fresh CAPTCHA...", "info");
        
        const response = await fetch("/api/cases/refresh-captcha", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                searchParams: window.originalSearchData || {}
            })
        });

        const result = await response.json();
        
        if (result.success) {
            // Update CAPTCHA image
            const captchaImage = document.getElementById("captchaImage");
            const sessionSpan = document.getElementById("captchaSessionId");
            const captchaSolution = document.getElementById("captchaSolution");
            
            if (captchaImage) {
                captchaImage.src = result.captchaImageUrl;
            }
            
            if (sessionSpan) {
                sessionSpan.textContent = result.formData.sessionId;
            }
            
            if (captchaSolution) {
                captchaSolution.value = "";
                captchaSolution.focus();
            }
            
            // Update global captcha data
            window.captchaData = result;
            
            showToast("CAPTCHA Refreshed", "New CAPTCHA loaded successfully", "success");
        } else {
            showToast("Refresh Failed", result.error || "Unable to refresh CAPTCHA", "danger");
        }
        
    } catch (error) {
        console.error("CAPTCHA refresh error:", error);
        showToast("Network Error", "Unable to refresh CAPTCHA. Please try again.", "danger");
    } finally {
        // Reset button state
        const refreshButton = document.querySelector("[onclick=\"refreshCaptchaImage()\"]");
        const icon = refreshButton?.querySelector("i");
        
        if (icon) {
            icon.classList.remove("fa-spinner", "fa-spin");
            icon.classList.add("fa-sync-alt");  
        }
        refreshButton.disabled = false;
    }
}
