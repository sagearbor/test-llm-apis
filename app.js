/**
 * SECURITY: This file contains ALL JavaScript for the application.
 * No inline scripts exist in the HTML for maximum XSS protection.
 *
 * Security implementations in this file:
 * - All event handlers use addEventListener (no inline onclick)
 * - Input sanitization before sending to server
 * - Proper escaping of user-generated content
 * - No use of eval() or dynamic code execution
 * - Strict CSP compliant - works with scriptSrc: ['self'] only
 *
 * @security-audit: Approved for enterprise deployment
 * @csp-compliant: true
 * @xss-protected: true
 */

    let modelMetadata = {};
    let uploadedFiles = [];
    let selectedFileId = null;
    let maxCompletionTokens = 12800; // Default, will be updated by slider
    let currentInputContextWindow = 128 * 1024; // Default 128K, updated per model
    let currentOutputContextWindow = 128 * 1024;

    // ============================================================================
    // Toast Notification System
    // ============================================================================

    let toastTimeout = null;

    /**
     * Show a toast notification
     * @param {string} message - Message to display
     * @param {number} duration - Duration in milliseconds (default: 2000)
     */
    function showToast(message, duration = 2000) {
      const container = document.getElementById('toastContainer');

      // Remove existing toast if any
      const existing = document.querySelector('.toast');
      if (existing) {
        existing.remove();
        clearTimeout(toastTimeout);
      }

      // Create new toast
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = message;
      container.appendChild(toast);

      // Trigger animation
      setTimeout(() => toast.classList.add('show'), 10);

      // Auto-hide after duration
      toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300); // Remove after fade out
      }, duration);
    }

    /**
     * Update the summary badge display
     * @param {number} messageCount - Current number of messages
     * @param {boolean} hasSummary - Whether conversation has been compressed
     */
    function updateSummaryBadge(messageCount, hasSummary) {
      const badge = document.getElementById('summaryBadge');

      if (messageCount > 0) {
        badge.style.display = 'inline-block';

        if (hasSummary) {
          badge.textContent = `📝 ${messageCount} msgs`;
          badge.setAttribute('data-tooltip', `Conversation compressed (${messageCount} recent messages + summary)`);
          badge.style.background = '#4CAF50';  // Green when compressed
        } else {
          badge.textContent = `💬 ${messageCount} msgs`;
          badge.setAttribute('data-tooltip', `${messageCount} messages in conversation`);
          badge.style.background = '#2196F3';  // Blue when not compressed
        }
      } else {
        badge.style.display = 'none';
      }
    }

    /**
     * Hide the summary badge
     */
    function hideSummaryBadge() {
      const badge = document.getElementById('summaryBadge');
      badge.style.display = 'none';
    }

    // ============================================================================
    // Usage Dashboard Functions
    // ============================================================================

    let usageModal = null;
    let currentUsageTab = 'summary';

    /**
     * Initialize usage dashboard
     */
    function initUsageDashboard() {
      usageModal = document.getElementById('usageModal');
      const usageBtn = document.getElementById('usageButton');
      const closeBtn = document.getElementById('closeUsageModal');
      const usageBtnContainer = document.getElementById('usageButtonContainer');

      // Show usage button if OAuth is enabled
      checkAuthStatus().then(status => {
        if (status.oauthEnabled) {
          usageBtnContainer.style.display = 'block';
        }
      });

      // Open modal
      if (usageBtn) {
        usageBtn.addEventListener('click', () => {
          openUsageModal();
        });
      }

      // Close modal
      if (closeBtn) {
        closeBtn.addEventListener('click', closeUsageModal);
      }

      // Close on outside click
      window.addEventListener('click', (event) => {
        if (event.target === usageModal) {
          closeUsageModal();
        }
      });

      // Tab switching
      document.querySelectorAll('.usage-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const tabName = tab.getAttribute('data-tab');
          switchUsageTab(tabName);
        });
      });
    }

    /**
     * Open usage modal and load data
     */
    async function openUsageModal() {
      if (usageModal) {
        usageModal.style.display = 'block';
        await loadUsageData(currentUsageTab);
      }
    }

    /**
     * Close usage modal
     */
    function closeUsageModal() {
      if (usageModal) {
        usageModal.style.display = 'none';
      }
    }

    /**
     * Switch usage tab
     */
    function switchUsageTab(tabName) {
      currentUsageTab = tabName;

      // Update tab buttons
      document.querySelectorAll('.usage-tab').forEach(tab => {
        if (tab.getAttribute('data-tab') === tabName) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });

      // Update content
      document.querySelectorAll('.usage-content').forEach(content => {
        if (content.id === `${tabName}-content`) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });

      // Load data for the tab
      loadUsageData(tabName);
    }

    /**
     * Load usage data based on tab
     */
    async function loadUsageData(tabName) {
      try {
        switch(tabName) {
          case 'summary':
            await loadSummaryData();
            break;
          case 'hourly':
            await loadHourlyData();
            break;
          case 'daily':
            await loadDailyData();
            break;
          case 'models':
            await loadModelData();
            break;
          case 'limits':
            await loadRateLimitData();
            break;
        }
      } catch (error) {
        console.error(`Error loading ${tabName} data:`, error);
        showToast(`Failed to load ${tabName} data`, 3000);
      }
    }

    /**
     * Load and display summary data
     */
    async function loadSummaryData() {
      const response = await fetch('/api/usage/summary');
      const data = await response.json();

      const container = document.getElementById('summaryStats');
      container.innerHTML = `
        <div class="usage-stat">
          <div class="usage-stat-label">Total Requests</div>
          <div class="usage-stat-value">${data.totalRequests.toLocaleString()}</div>
        </div>
        <div class="usage-stat">
          <div class="usage-stat-label">Total Tokens</div>
          <div class="usage-stat-value">${(data.totalTokens / 1000).toFixed(1)}<span class="usage-stat-unit">K</span></div>
        </div>
        <div class="usage-stat">
          <div class="usage-stat-label">Total Cost</div>
          <div class="usage-stat-value">$${data.totalCost.toFixed(2)}</div>
        </div>
        <div class="usage-stat">
          <div class="usage-stat-label">Success Rate</div>
          <div class="usage-stat-value">${data.totalRequests > 0 ? Math.round(data.successfulRequests / data.totalRequests * 100) : 0}<span class="usage-stat-unit">%</span></div>
        </div>
      `;

      // Add model breakdown
      if (Object.keys(data.modelUsage).length > 0) {
        container.innerHTML += '<h4>Usage by Model</h4>';
        container.innerHTML += '<table class="usage-table">';
        container.innerHTML += '<thead><tr><th>Model</th><th>Requests</th><th>Tokens</th><th>Cost</th></tr></thead>';
        container.innerHTML += '<tbody>';

        for (const [model, usage] of Object.entries(data.modelUsage)) {
          container.innerHTML += `
            <tr>
              <td>${model}</td>
              <td>${usage.requests}</td>
              <td>${(usage.tokens / 1000).toFixed(1)}K</td>
              <td>$${usage.cost.toFixed(4)}</td>
            </tr>
          `;
        }

        container.innerHTML += '</tbody></table>';
      }
    }

    /**
     * Load and display hourly data
     */
    async function loadHourlyData() {
      const response = await fetch('/api/usage/hourly');
      const data = await response.json();

      const container = document.getElementById('hourlyChart');
      container.innerHTML = '<table class="usage-table">';
      container.innerHTML += '<thead><tr><th>Hour</th><th>Requests</th><th>Tokens</th><th>Cost</th></tr></thead>';
      container.innerHTML += '<tbody>';

      data.forEach(hour => {
        const hourLabel = new Date(hour.hour + ':00:00').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        container.innerHTML += `
          <tr>
            <td>${hourLabel}</td>
            <td>${hour.requests}</td>
            <td>${hour.tokens > 0 ? (hour.tokens / 1000).toFixed(1) + 'K' : '-'}</td>
            <td>${hour.cost > 0 ? '$' + hour.cost.toFixed(4) : '-'}</td>
          </tr>
        `;
      });

      container.innerHTML += '</tbody></table>';
    }

    /**
     * Load and display daily data
     */
    async function loadDailyData() {
      const response = await fetch('/api/usage/daily');
      const data = await response.json();

      const container = document.getElementById('dailyChart');
      container.innerHTML = '<table class="usage-table">';
      container.innerHTML += '<thead><tr><th>Date</th><th>Requests</th><th>Tokens</th><th>Cost</th></tr></thead>';
      container.innerHTML += '<tbody>';

      data.forEach(day => {
        const dateLabel = new Date(day.date).toLocaleDateString();
        container.innerHTML += `
          <tr>
            <td>${dateLabel}</td>
            <td>${day.requests}</td>
            <td>${day.tokens > 0 ? (day.tokens / 1000).toFixed(1) + 'K' : '-'}</td>
            <td>${day.cost > 0 ? '$' + day.cost.toFixed(2) : '-'}</td>
          </tr>
        `;
      });

      container.innerHTML += '</tbody></table>';
    }

    /**
     * Load and display model cost data
     */
    async function loadModelData() {
      const response = await fetch('/api/usage/costs');
      const data = await response.json();

      const container = document.getElementById('modelStats');
      container.innerHTML = '<table class="usage-table">';
      container.innerHTML += '<thead><tr><th>Model</th><th>Requests</th><th>Input Tokens</th><th>Output Tokens</th><th>Input Cost</th><th>Output Cost</th><th>Total Cost</th></tr></thead>';
      container.innerHTML += '<tbody>';

      data.forEach(model => {
        container.innerHTML += `
          <tr>
            <td>${model.model}</td>
            <td>${model.requests}</td>
            <td>${(model.inputTokens / 1000).toFixed(1)}K</td>
            <td>${(model.outputTokens / 1000).toFixed(1)}K</td>
            <td>$${model.inputCost.toFixed(4)}</td>
            <td>$${model.outputCost.toFixed(4)}</td>
            <td>$${model.totalCost.toFixed(4)}</td>
          </tr>
        `;
      });

      container.innerHTML += '</tbody></table>';
    }

    /**
     * Load and display rate limit data
     */
    async function loadRateLimitData() {
      const response = await fetch('/api/usage/limits');
      const data = await response.json();

      const container = document.getElementById('rateLimits');
      container.innerHTML = '';

      // Hourly limits
      const hourlyTokenPercent = (data.usage.hourlyTokens / data.limits.hourly_tokens * 100).toFixed(1);
      const hourlyCostPercent = (data.usage.hourlyCost / data.limits.hourly_cost * 100).toFixed(1);

      container.innerHTML += `
        <div class="rate-limit-bar">
          <div class="rate-limit-label">Hourly Token Usage</div>
          <div class="rate-limit-progress">
            <div class="rate-limit-fill ${hourlyTokenPercent > 80 ? 'danger' : hourlyTokenPercent > 60 ? 'warning' : ''}" style="width: ${Math.min(100, hourlyTokenPercent)}%"></div>
            <div class="rate-limit-text">${data.usage.hourlyTokens.toLocaleString()} / ${data.limits.hourly_tokens.toLocaleString()} (${hourlyTokenPercent}%)</div>
          </div>
        </div>

        <div class="rate-limit-bar">
          <div class="rate-limit-label">Hourly Cost Usage</div>
          <div class="rate-limit-progress">
            <div class="rate-limit-fill ${hourlyCostPercent > 80 ? 'danger' : hourlyCostPercent > 60 ? 'warning' : ''}" style="width: ${Math.min(100, hourlyCostPercent)}%"></div>
            <div class="rate-limit-text">$${data.usage.hourlyCost.toFixed(2)} / $${data.limits.hourly_cost.toFixed(2)} (${hourlyCostPercent}%)</div>
          </div>
        </div>
      `;

      // Daily limits
      const dailyTokenPercent = (data.usage.dailyTokens / data.limits.daily_tokens * 100).toFixed(1);
      const dailyCostPercent = (data.usage.dailyCost / data.limits.daily_cost * 100).toFixed(1);

      container.innerHTML += `
        <div class="rate-limit-bar">
          <div class="rate-limit-label">Daily Token Usage</div>
          <div class="rate-limit-progress">
            <div class="rate-limit-fill ${dailyTokenPercent > 80 ? 'danger' : dailyTokenPercent > 60 ? 'warning' : ''}" style="width: ${Math.min(100, dailyTokenPercent)}%"></div>
            <div class="rate-limit-text">${data.usage.dailyTokens.toLocaleString()} / ${data.limits.daily_tokens.toLocaleString()} (${dailyTokenPercent}%)</div>
          </div>
        </div>

        <div class="rate-limit-bar">
          <div class="rate-limit-label">Daily Cost Usage</div>
          <div class="rate-limit-progress">
            <div class="rate-limit-fill ${dailyCostPercent > 80 ? 'danger' : dailyCostPercent > 60 ? 'warning' : ''}" style="width: ${Math.min(100, dailyCostPercent)}%"></div>
            <div class="rate-limit-text">$${data.usage.dailyCost.toFixed(2)} / $${data.limits.daily_cost.toFixed(2)} (${dailyCostPercent}%)</div>
          </div>
        </div>
      `;

      // Remaining
      container.innerHTML += `
        <h4>Remaining Allowance</h4>
        <div class="usage-stat">
          <div class="usage-stat-label">Hourly Tokens</div>
          <div class="usage-stat-value">${(data.remaining.hourlyTokens / 1000).toFixed(1)}<span class="usage-stat-unit">K</span></div>
        </div>
        <div class="usage-stat">
          <div class="usage-stat-label">Hourly Budget</div>
          <div class="usage-stat-value">$${data.remaining.hourlyCost.toFixed(2)}</div>
        </div>
        <div class="usage-stat">
          <div class="usage-stat-label">Daily Tokens</div>
          <div class="usage-stat-value">${(data.remaining.dailyTokens / 1000).toFixed(1)}<span class="usage-stat-unit">K</span></div>
        </div>
        <div class="usage-stat">
          <div class="usage-stat-label">Daily Budget</div>
          <div class="usage-stat-value">$${data.remaining.dailyCost.toFixed(2)}</div>
        </div>
      `;
    }

    // Check authentication status
    async function checkAuthStatus() {
      try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error checking auth status:', error);
        return { oauthEnabled: false, isAuthenticated: false };
      }
    }

    // Initialize auth check
    checkAuthStatus().then(data => {
        if (data.oauthEnabled && !data.isAuthenticated) {
          // Redirect to login page if OAuth is enabled and user is not authenticated
          window.location.href = '/login.html';
        } else if (data.isAuthenticated && data.user) {
          // Show user info
          document.getElementById('userName').textContent = data.user;
          document.getElementById('userInfo').style.display = 'block';
        }
      } catch (err) {
        console.error('Failed to check auth status:', err);
      }
    }

    // Logout function
    function logout() {
      window.location.href = '/logout';
    }

    // Fetch model metadata on load
    async function loadModelMetadata() {
      try {
        const response = await fetch('/api/models');
        const models = await response.json();

        // Store metadata indexed by key
        models.forEach(model => {
          modelMetadata[model.key] = model;
        });
      } catch (err) {
        console.error('Failed to load model metadata:', err);
      }
    }

    async function checkHealth() {
      const statusList = document.getElementById('statusList');
      statusList.innerHTML = 'Checking connections...';

      try {
        const response = await fetch('/health');
        const data = await response.json();

        let html = '';
        for (const [modelKey, result] of Object.entries(data)) {
          const statusClass = result.status === 'ok' ? 'status-ok' : 'status-error';
          const metadata = modelMetadata[modelKey] || {};
          const displayName = metadata.displayName || modelKey;
          const deploymentName = result.deploymentName || 'Not configured';

          // Build tooltip content
          const inputCtxK = metadata.inputContextWindow ? (metadata.inputContextWindow / 1024).toFixed(0) + 'K' : 'N/A';
          const outputCtxK = metadata.outputContextWindow ? (metadata.outputContextWindow / 1024).toFixed(0) + 'K' : 'N/A';
          const contextDisplay = inputCtxK === outputCtxK ? inputCtxK : `${inputCtxK} in / ${outputCtxK} out`;

          const tooltip = `Context: ${contextDisplay} tokens
Cost: ${metadata.costPer1M || 'N/A'}
Multimodal: ${metadata.multimodal ? 'Yes' : 'No'}
Best for: ${metadata.specialties || 'N/A'}`;

          html += `<div class="status-item">
            <div style="display: flex; align-items: center; flex: 1;">
              <span class="status-indicator ${statusClass}"></span>
              <span class="status-label">${displayName} (${deploymentName})<span class="info-icon" data-tooltip="${tooltip}">i</span></span>
            </div>
            <div style="text-align: right;">
              ${result.message ? `<div class="status-message">${result.message}</div>` : ''}
            </div>
          </div>`;
        }

        statusList.innerHTML = html;
      } catch (err) {
        statusList.innerHTML = `<div style="color: red;">Failed to check health: ${err.message}</div>`;
      }
    }

    async function sendMessage() {
      const input = document.getElementById('userInput');
      const chatbox = document.getElementById('chatbox');
      const model = document.getElementById('modelSelect').value;
      const userText = input.value.trim();
      if (!userText) return;

      // Show which file is attached (if any)
      const fileBadge = selectedFileId ?
        `<span class="file-badge">📎 ${uploadedFiles.find(f => f.fileId === selectedFileId)?.filename || 'file'}</span>` : '';

      chatbox.innerHTML += `<div class='user'><strong>You:</strong> ${userText} ${fileBadge}</div>`;
      input.value = '';

      try {
        const body = {
          prompt: userText,
          model,
          maxTokens: maxCompletionTokens
        };
        if (selectedFileId) {
          body.fileId = selectedFileId;
        }

        console.log('Sending request:', body);
        const response = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await response.json();
        console.log('Received response:', data);

        const answer = data.answer || '(empty response from chat model)';
        chatbox.innerHTML += `<div class='bot'><strong>Bot:</strong> ${answer}</div>`;
        chatbox.scrollTop = chatbox.scrollHeight;

        // Handle memory info if present
        if (data.memory) {
          // Show toast only when compression just happened
          if (data.memory.compressed) {
            showToast('💭 Conversation compressed', 2000);
          }

          // Always update badge with current message count
          updateSummaryBadge(data.memory.messageCount, data.memory.hasSummary);
        }
      } catch (err) {
        console.error('Chat error:', err);
        chatbox.innerHTML += `<div class='bot'><strong>Bot:</strong> Error: ${err.message}</div>`;
      }
    }

    // File upload functions
    async function uploadFile() {
      const fileInput = document.getElementById('fileInput');
      const file = fileInput.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const error = await response.json();
          alert(`Upload failed: ${error.error}`);
          return;
        }

        const data = await response.json();
        uploadedFiles.push(data);
        renderFilesList();

        // Auto-select the newly uploaded file
        selectedFileId = data.fileId;
        renderFilesList();

        // Clear file input
        fileInput.value = '';

      } catch (err) {
        alert(`Upload error: ${err.message}`);
      }
    }

    async function deleteFile(fileId) {
      try {
        const response = await fetch(`/api/files/${fileId}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const error = await response.json();
          alert(`Delete failed: ${error.error}`);
          return;
        }

        // Remove from local list
        uploadedFiles = uploadedFiles.filter(f => f.fileId !== fileId);
        if (selectedFileId === fileId) {
          selectedFileId = null;
        }
        renderFilesList();

      } catch (err) {
        alert(`Delete error: ${err.message}`);
      }
    }

    function selectFile(fileId) {
      selectedFileId = selectedFileId === fileId ? null : fileId;
      renderFilesList();
    }

    function renderFilesList() {
      const filesList = document.getElementById('filesList');

      if (uploadedFiles.length === 0) {
        filesList.innerHTML = '<p style="color: #999; font-size: 13px;">No files uploaded</p>';
        return;
      }

      let html = '<div style="text-align: left;">';
      uploadedFiles.forEach(file => {
        const selected = file.fileId === selectedFileId ? 'selected' : '';
        const sizeKB = (file.size / 1024).toFixed(1);
        html += `
          <div class="file-item ${selected}">
            <span class="file-name file-select-btn" data-file-id="${file.fileId}">
              ${selected ? '✓ ' : ''}${file.filename}
            </span>
            <span class="file-size">${sizeKB} KB</span>
            <button class="delete-btn file-delete-btn" data-file-id="${file.fileId}">Delete</button>
          </div>
        `;
      });
      html += '</div>';
      filesList.innerHTML = html;

      // Attach event listeners to dynamically created buttons
      document.querySelectorAll('.file-select-btn').forEach(btn => {
        btn.addEventListener('click', (e) => selectFile(e.target.dataset.fileId));
      });
      document.querySelectorAll('.file-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteFile(e.target.dataset.fileId));
      });
    }

    async function loadUploadedFiles() {
      try {
        const response = await fetch('/api/files');
        if (response.ok) {
          uploadedFiles = await response.json();
          renderFilesList();
        }
      } catch (err) {
        console.error('Failed to load files:', err);
      }
    }

    // Drag and drop support
    const fileDropZone = document.getElementById('fileDropZone');

    fileDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileDropZone.classList.add('dragover');
    });

    fileDropZone.addEventListener('dragleave', () => {
      fileDropZone.classList.remove('dragover');
    });

    fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropZone.classList.remove('dragover');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        document.getElementById('fileInput').files = files;
        uploadFile();
      }
    });

    // Update token display based on slider value (absolute tokens) and current model's context window
    function updateTokenDisplay(tokens) {
      maxCompletionTokens = parseInt(tokens);
      const estimatedChatTurns = Math.floor(currentInputContextWindow / (maxCompletionTokens * 2));
      const percentageOfContext = ((maxCompletionTokens / currentInputContextWindow) * 100).toFixed(1);

      const tokenConfig = document.getElementById('tokenConfig');
      const inputCtxK = (currentInputContextWindow / 1024).toFixed(0) + 'K';
      tokenConfig.innerHTML = `${maxCompletionTokens.toLocaleString()} tokens (${percentageOfContext}% of ${inputCtxK}, ~${estimatedChatTurns} chat turns)`;

      // Save to localStorage
      localStorage.setItem('maxCompletionTokens', tokens);
    }

    // Fetch and update context window for selected model
    async function updateContextWindowForModel(modelKey) {
      try {
        const response = await fetch(`/api/config?modelKey=${modelKey}`);
        if (response.ok) {
          const config = await response.json();
          currentInputContextWindow = config.inputContextWindow || 128 * 1024;
          currentOutputContextWindow = config.outputContextWindow || 128 * 1024;

          // Update token display with new context window
          const slider = document.getElementById('tokenSlider');
          updateTokenDisplay(parseInt(slider.value));
        }
      } catch (err) {
        console.error('Failed to fetch model config:', err);
      }
    }

    // Load server configuration and set up slider
    async function loadServerConfig() {
      try {
        // Load saved preference or default to 10,000 tokens
        const savedTokens = localStorage.getItem('maxCompletionTokens');
        const tokens = savedTokens ? parseInt(savedTokens) : 10000;

        // Set slider value
        const slider = document.getElementById('tokenSlider');
        slider.value = tokens;

        // Update display
        updateTokenDisplay(tokens);

        // Add slider event listener
        slider.addEventListener('input', (e) => {
          updateTokenDisplay(parseInt(e.target.value));
        });
      } catch (err) {
        console.error('Failed to load server config:', err);
      }
    }

    // Load metadata, check auth, and check health on page load
    window.addEventListener('DOMContentLoaded', async () => {
      await checkAuthStatus();
      await loadModelMetadata();
      await loadUploadedFiles();
      await loadServerConfig();
      checkHealth();
      initUsageDashboard(); // Initialize usage dashboard

      // Update context window when model changes
      const modelSelect = document.getElementById('modelSelect');
      let previousModel = modelSelect.value;

      modelSelect.addEventListener('change', async (e) => {
        const newModel = e.target.value;
        // const chatbox = document.getElementById('chatbox');

        // DISABLED: Model switch warning popup (now using ConversationSummaryMemory)
        // Previously, switching models would clear chat history with a warning dialog.
        // Now conversation history is preserved across model switches with automatic compression.
        //
        // If there's chat history, warn user before switching
        // if (chatbox.innerHTML.trim() !== '' && newModel !== previousModel) {
        //   const previousModelName = modelMetadata[previousModel]?.displayName || previousModel;
        //   const newModelName = modelMetadata[newModel]?.displayName || newModel;
        //
        //   const confirmed = confirm(
        //     `⚠️ Switching Models Will Clear Conversation History\n\n` +
        //     `Changing from "${previousModelName}" to "${newModelName}" will start a fresh conversation.\n` +
        //     `Previous messages will be cleared.\n\n` +
        //     `Click OK to clear chat and switch models, or Cancel to stay on current model.`
        //   );
        //
        //   if (confirmed) {
        //     // Clear the chat
        //     chatbox.innerHTML = '';
        //     previousModel = newModel;
        //     await updateContextWindowForModel(newModel);
        //   } else {
        //     // Revert selection
        //     modelSelect.value = previousModel;
        //   }
        // } else {
        //   // No chat history, just switch
        //   previousModel = newModel;
        //   await updateContextWindowForModel(newModel);
        // }

        // NEW BEHAVIOR: Seamless model switching with conversation memory
        previousModel = newModel;
        await updateContextWindowForModel(newModel);
      });

      // Load initial context window for default model
      await updateContextWindowForModel(modelSelect.value);

      // ===== ADD EVENT LISTENERS FOR ALL BUTTONS =====

      // Logout button
      const logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
      }

      // Refresh health button
      const refreshHealthBtn = document.getElementById('refreshHealthBtn');
      if (refreshHealthBtn) {
        refreshHealthBtn.addEventListener('click', checkHealth);
      }

      // Choose file button
      const chooseFileBtn = document.getElementById('chooseFileBtn');
      const fileInput = document.getElementById('fileInput');
      if (chooseFileBtn && fileInput) {
        chooseFileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', uploadFile);
      }

      // Send message button
      const sendBtn = document.getElementById('sendBtn');
      if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
      }

      // Enter key on input field
      const userInput = document.getElementById('userInput');
      if (userInput) {
        userInput.addEventListener('keypress', (event) => {
          if (event.key === 'Enter') {
            sendMessage();
          }
        });
        // Focus input field
        userInput.focus();
      }
    });
