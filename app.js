// ==========================================================
// =================== CONFIGURATION ========================
// ==========================================================
// !!! Google Apps Script URL (Deployed Web App URL) !!!
// Make sure this URL is correct and your Apps Script is deployed as a Web App
// IMPORTANT: REPLACE THIS PLACEHOLDER WITH YOUR ACTUAL DEPLOYED GOOGLE APPS SCRIPT URL (e.g., ends with /exec)
const APPS_SCRIPT_URL = 'https://script.google.com/a/macros/yru.ac.th/s/AKfycbwpoIXjBwiXIrwDUX9PhgsY-EbgfdTmrQYUctQ2E_jDVjL0MHsmaPUQVIg_X69FnMwU/exec'; // Placeholder, replace with your actual URL

// !!! Removed ADMIN_SECRET_KEY as authentication is now handled by Google Sign-In !!!
// ==========================================================

// Global variables to store product data and current states
let allProducts = [];
let currentFilter = 'ทั้งหมด'; // Stores the currently selected category filter
let currentSearchTerm = ''; // Stores the current search query
let selectedFileBase64 = []; // Changed to array to store multiple base64 images of newly selected files
let selectedFileNames = []; // To store file names for newly selected files
let productImages = []; // Stores the CURRENT image URLs of a product (either existing from sheet or newly uploaded) when editing

// Global variable to store user's Google ID token after successful login
let googleIdToken = null;

// ---- Helper Functions ----
/**
 * Safely gets a DOM element by its ID.
 * @param {string} id - The ID of the element.
 * @returns {HTMLElement | null} The element or null if not found.
 */
const getEl = (id) => document.getElementById(id);

/**
 * Shows a DOM element by removing the 'd-none' class.
 * @param {HTMLElement} el - The element to show.
 */
const show = (el) => el && el.classList.remove('d-none');

/**
 * Hides a DOM element by adding the 'd-none' class.
 * @param {HTMLElement} el - The element to hide.
 */
const hide = (el) => el && el.classList.add('d-none');

/**
 * Custom alert/confirm modal using Bootstrap's modal structure.
 * This function creates and shows a modal dynamically.
 * @param {string} message - The message to display.
 * @param {string} type - 'info', 'success', 'error', 'warning' (for text color/icon).
 * @param {boolean} [isConfirm=false] - If true, shows OK/Cancel buttons.
 * @returns {Promise<boolean>} Resolves true for OK, false for Cancel (only if isConfirm).
 */
function showCustomAlert(message, type = 'info', isConfirm = false) {
    return new Promise((resolve) => {
        const modalId = 'customModal';
        let modalOverlay = getEl('custom-modal-overlay');

        if (!modalOverlay) {
            modalOverlay = document.createElement('div');
            modalOverlay.id = 'custom-modal-overlay';
            modalOverlay.classList.add('custom-modal-overlay');
            document.body.appendChild(modalOverlay);
        }

        let modalContent = `
            <div class="custom-modal-content">
                <div class="custom-modal-header ${type}">
                    <h5 class="custom-modal-title">${isConfirm ? 'ยืนยันการกระทำ' : 'แจ้งเตือน'}</h5>
                    <button type="button" class="custom-modal-close" aria-label="Close">&times;</button>
                </div>
                <div class="custom-modal-body">
                    <!-- Message content will be set using textContent to prevent XSS -->
                </div>
                <div class="custom-modal-footer">
                    ${isConfirm ? `
                        <button type="button" class="btn btn-secondary me-2" data-action="cancel">ยกเลิก</button>
                        <button type="button" class="btn btn-primary" data-action="ok">ตกลง</button>
                    ` : `
                        <button type="button" class="btn btn-primary" data-action="ok">ตกลง</button>
                    `}
                </div>
            </div>
        `;
        modalOverlay.innerHTML = modalContent;

        const modalInstance = modalOverlay; // Reference to the overlay, which contains the modal
        const modalBody = modalInstance.querySelector('.custom-modal-body'); // Get modal body to insert text
        const okButton = modalInstance.querySelector('[data-action="ok"]');
        const cancelButton = modalInstance.querySelector('[data-action="cancel"]');
        const closeButton = modalInstance.querySelector('.custom-modal-close');

        // Set message using textContent to prevent XSS
        const messageParagraph = document.createElement('p');
        messageParagraph.classList.add(`text-${type}`);
        messageParagraph.textContent = message; // Use textContent here to prevent XSS
        modalBody.appendChild(messageParagraph);

        // Function to close the modal and resolve the promise
        const closeModal = (result) => {
            modalInstance.classList.remove('show');
            // Use animationend event to ensure modal is removed AFTER fadeOutUp animation
            modalInstance.addEventListener('animationend', () => modalInstance.remove(), { once: true });
            resolve(result);
        };

        okButton && okButton.addEventListener('click', () => closeModal(true));
        cancelButton && cancelButton.addEventListener('click', () => closeModal(false));
        closeButton && closeButton.addEventListener('click', () => closeModal(false));

        // Close when clicking outside modal content
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal(false);
            }
        });

        // Show the modal
        setTimeout(() => modalInstance.classList.add('show'), 10); // Small delay to trigger transition
    });
}


/**
 * Sends data to Google Apps Script.
 * For admin actions, it will include the Google ID token.
 * @param {string} action - The action to perform (e.g., 'getProducts', 'addProduct', 'updateProduct', 'deleteProduct', 'uploadImage').
 * @param {object} [data={}] - The data to send.
 * @param {string} [method='POST'] - HTTP method ('GET' or 'POST').
 * @returns {Promise<object>} The JSON response from the Apps Script.
 */
async function sendData(action, data = {}, method = 'POST') {
    let requestBody = {};

    try {
        if (method === 'GET') {
            const url = new URL(APPS_SCRIPT_URL);
            url.searchParams.append('action', action);
            // Append all data properties as search params for GET requests
            for (const key in data) {
                if (Object.hasOwnProperty.call(data, key)) {
                    url.searchParams.append(key, data[key]);
                }
            }
            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();

        } else {
            // For POST requests (addProduct, updateProduct, deleteProduct, uploadImage)
            // No longer send secretKey, authentication is handled by Google's session implicitly on the Apps Script side
            // The Apps Script web app implicitly knows the user's email if deployed as "User accessing the web app"
            requestBody = {
                action: action,
                data: data
            };
        }

        const response = await fetch(APPS_SCRIPT_URL, {
            method: method,
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8', // Apps Script typically expects this for JSON body
            },
            body: JSON.stringify(requestBody) // Send the requestBody as JSON string
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}. Response: ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Send Data API Error:", error);
        showCustomAlert('เกิดข้อผิดพลาดในการส่งข้อมูล: ' + error.message, 'error');
        return { success: false, message: error.message };
    }
}


// ---- Product Management Functions for index.html ----

/**
 * Renders product cards to the DOM.
 * @param {Array<object>} products - Array of product objects.
 */
function renderProducts(products) {
    const productListEl = getEl('product-list-container'); // Corrected ID from 'product-list' to 'product-list-container'
    if (!productListEl) return;

    productListEl.innerHTML = '';
    hide(getEl('loader'));
    hide(getEl('no-products-found')); // Corrected ID from 'no-results' to 'no-products-found'

    if (products.length === 0) {
        show(getEl('no-products-found'));
        return;
    }

    products.forEach(product => {
        // Ensure image_url is an array, convert old formats if necessary
        let imageUrls = [];
        if (product.image_url) {
            imageUrls = String(product.image_url).split(',').map(url => url.trim());
            // Convert old Google Drive 'uc' URLs to 'lh3' format for display
            imageUrls = imageUrls.map(url => {
                if (url.includes('drive.google.com/uc?export=view&id=')) {
                    const fileIdMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
                    if (fileIdMatch && fileIdMatch[1]) {
                        return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
                    }
                }
                return url;
            });
        }
        const firstImageUrl = imageUrls[0] || 'https://placehold.co/400x250/cccccc/333333?text=No+Image'; // Fallback image


        // Determine if it's a mobile product (example: based on category containing 'มือถือ' or similar)
        const isMobileProduct = product.category && product.category.includes('มือถือ'); // Example condition
        const cardClass = isMobileProduct ? 'product-card mobile' : 'product-card';

        const productCardHtml = `
            <div class="col animate__animated animate__fadeInUp">
                <div class="${cardClass}">
                    <img src="${firstImageUrl}" class="card-img-top" alt="${product.name}" onerror="this.onerror=null;this.src='https://placehold.co/400x250/cccccc/333333?text=No+Image';">
                    <div class="card-body">
                        <h5 class="card-title">${product.name}</h5>
                        <p class="product-price">฿${parseFloat(product.price).toFixed(2)}</p>
                        ${product.shopee_url ? `<a href="${product.shopee_url}" target="_blank" class="btn btn-shopee" rel="noopener noreferrer"><i class="fas fa-shopping-cart me-2"></i>สั่งซื้อที่ Shopee</a>` : ''}
                    </div>
                </div>
            </div>
        `;
        productListEl.insertAdjacentHTML('beforeend', productCardHtml);
    });
}

/**
 * Filters and searches products based on current criteria.
 */
function filterAndSearchProducts() {
    let filtered = allProducts;

    if (currentFilter !== 'ทั้งหมด') {
        filtered = filtered.filter(product =>
            product.category && product.category.toLowerCase().includes(currentFilter.toLowerCase())
        );
    }

    if (currentSearchTerm) {
        const lowerCaseSearchTerm = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(product =>
            (product.name && product.name.toLowerCase().includes(lowerCaseSearchTerm)) ||
            (product.id && String(product.id).toLowerCase().includes(lowerCaseSearchTerm)) ||
            (product.category && product.category.toLowerCase().includes(lowerCaseSearchTerm))
        );
    }

    renderProducts(filtered);
}

/**
 * Loads products from Google Apps Script.
 */
async function loadProducts() {
    const productListEl = getEl('product-list-container'); // Corrected ID
    const loaderEl = getEl('loader');
    const noResultsEl = getEl('no-products-found'); // Corrected ID

    if (productListEl) productListEl.innerHTML = '';
    if (loaderEl) show(loaderEl);
    if (noResultsEl) hide(noResultsEl);

    try {
        const response = await sendData('getProducts', {}, 'GET');
        if (response.success && response.data) {
            allProducts = response.data;
            filterAndSearchProducts();
        } else {
            allProducts = [];
            show(noResultsEl);
            if (response.message) {
                console.error("Failed to load products:", response.message);
            }
        }
    } catch (error) {
        console.error("Error loading products:", error);
        allProducts = [];
        show(noResultsEl);
    } finally {
        if (loaderEl) hide(loaderEl);
    }
}

/**
 * Fetches unique categories from Apps Script and renders them as filter buttons.
 * @param {HTMLElement} containerDiv - The div where category buttons will be appended.
 */
async function fetchAndRenderCategories() {
    // This function is intended for a category filter *buttons* section,
    // but the provided HTML uses a <select> element for categories.
    // The current implementation in app.js for index.html only loads product data,
    // and relies on the static options in the <select> element.
    // Therefore, this function is not directly used by the current `index.html` structure.
    // If you intend to use dynamic buttons for categories, you would need a new container div for them.

    const categorySelect = getEl('category-select'); // Use the select element directly
    if (!categorySelect) return;

    // Clear existing options, keep the "All" option if desired
    // For a dynamic select, you might clear all then re-add.
    // For now, assuming static options are fine or they are dynamically populated elsewhere.

    const result = await sendData('getCategories', {}, 'GET');
    if (result && result.success && result.categories) {
        // Clear existing dynamic options, keep the first "All" option if present
        while (categorySelect.children.length > 1) { // Keep the first option ("หมวดหมู่ทั้งหมด")
            categorySelect.removeChild(categorySelect.lastChild);
        }

        result.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });
    } else {
        console.error("Failed to fetch categories for select dropdown:", result ? result.message : "Unknown error");
    }
}


// --- Event Listeners for index.html ---
document.addEventListener('DOMContentLoaded', () => {
    // Check if the current page is index.html (or not admin.html)
    const path = window.location.pathname;
    if (!path.includes('admin.html')) {
        loadProducts(); // Load products for the main shop page
        fetchAndRenderCategories(); // Load and render categories

        // Ensure search input event listener is attached
        const searchInput = getEl('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                currentSearchTerm = searchInput.value.trim();
                filterAndSearchProducts();
            });
        }

        // Category select change listener
        const categorySelect = getEl('category-select');
        if (categorySelect) {
            categorySelect.addEventListener('change', () => {
                currentFilter = categorySelect.value;
                filterAndSearchProducts();
            });
        }

        // Back to Top button logic
        const backToTopButton = getEl('back-to-top');
        if (backToTopButton) {
            window.addEventListener('scroll', () => {
                if (window.scrollY > 300) {
                    show(backToTopButton);
                } else {
                    hide(backToTopButton);
                }
            });
            backToTopButton.addEventListener('click', (e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        // Smooth scroll for Hero section's "ดูสินค้าทั้งหมด" button (if it exists)
        // Note: The provided index.html snippet does not show this button.
        // If it were present, its href would need to be #products-section.
        const heroScrollBtn = document.querySelector('.hero-section .btn-primary');
        if (heroScrollBtn) {
            heroScrollBtn.addEventListener('click', function(e) {
                e.preventDefault();
                const targetId = this.getAttribute('href');
                const targetEl = document.querySelector(targetId);
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }
    } else {
        // Admin Page Specific Logic (ONLY runs if on admin.html)
        initAdminPage();
    }
});


// ==========================================================
// ===================== ADMIN PANEL LOGIC ==================
// ==========================================================

// DOM Elements for Admin Panel
const adminLoginGate = getEl('login-gate');
const adminPanel = getEl('admin-panel');
// passwordInput and loginBtn are removed as we use Google Sign-In
const logoutBtn = getEl('logout-btn');

const productForm = getEl('product-form');
const productIdInput = getEl('product-id');
const nameInput = getEl('name');
const categoryInput = getEl('category');
const priceInput = getEl('price');
const shopeeLinkInput = getEl('shopeeLink');
const imageFileInput = getEl('imageFileInput'); // File input for new images
const imagePreviewContainer = getEl('imagePreview'); // Container for image previews

const formTitle = getEl('form-title');
const clearBtn = getEl('clear-btn');
const adminProductList = getEl('admin-product-list');
const adminSearchInput = getEl('admin-search-input');
const adminLoader = getEl('loader'); // Reusing loader ID for admin page

let adminProducts = []; // Stores products for admin table

// --- Google Sign-In Integration ---
// Global callback function for Google Identity Services (GSI)
// This function will be called by the GSI client.js script after a user signs in.
function handleCredentialResponse(response) {
    if (response.credential) {
        // Store the ID token (JWT) in sessionStorage
        googleIdToken = response.credential;
        // At this point, the user is authenticated by Google.
        // The Apps Script doPost function will check if the user's email is an authorized admin.
        
        // We don't need to send the token to Apps Script directly here for basic auth check,
        // as Apps Script will get the user's email from the active session due to `Execute as: User accessing the web app`.
        // The token is primarily for more advanced server-side validation or other APIs.
        
        // Instead of directly logging in, we just refresh the UI based on Google's session.
        // The actual authorization check happens when sendData is called for admin actions.
        checkLoginStatus(); // Recheck UI status after Google login
        showCustomAlert('เข้าสู่ระบบด้วย Google สำเร็จ! ตรวจสอบสิทธิ์ผู้ดูแลระบบ...', 'info');
    } else {
        console.error("Google Sign-In failed: No credential received.");
        showCustomAlert('การเข้าสู่ระบบด้วย Google ไม่สำเร็จ', 'error');
        googleIdToken = null;
    }
}

// --- Admin Panel Functions ---

/**
 * Initializes the admin page: checks login status, sets up events.
 * This is called on DOMContentLoaded if on admin.html.
 */
function initAdminPage() {
    // Note: handleLogin is no longer directly called by a button in admin.html.
    // Google Sign-In's handleCredentialResponse will manage the login status.
    checkLoginStatus();
    setupAdminEventListeners();
    // Load products only if already logged in or after successful Google login
    // This is handled by checkLoginStatus now.
}

/**
 * Checks if the user is authenticated via Google (implicitly by Apps Script's session)
 * and toggles UI based on whether they are an authorized admin.
 * We rely on Apps Script to tell us if the current user (from Google's session) is authorized.
 */
async function checkLoginStatus() {
    // Make a small, authorized request to Apps Script to check admin status
    // A simple 'getProducts' request will implicitly check authentication on Apps Script side
    // because `doGet` is set to `Execute as: User accessing the web app`.
    // If the user's Google session is active, Apps Script will know their email.
    // If the user is authorized, getProducts will succeed. Otherwise, it will fail (unauthorized).

    // Let's create a dedicated endpoint for checking admin status in Code.gs
    // For now, we'll try to load admin products, and if it fails, we assume not logged in/authorized.
    // More robust approach: Add a new `action='checkAdminStatus'` to Code.gs that just returns true/false.

    // A simpler way for frontend: if `google.accounts.id.getCredentialResponse()` exists (meaning user logged in Google)
    // then we assume the user has a Google session.
    // Then we trigger loadAdminProducts and let the backend decide authorization.

    if (googleIdToken) { // Assuming googleIdToken indicates a successful Google Sign-In happened in this session
        // User has signed in with Google. Now check if they are an AUTHORIZED_ADMIN_EMAIL.
        // The actual check is on the Apps Script side when an admin action is attempted.
        // For UI purposes, we assume they are attempting to be admin.
        show(adminPanel);
        hide(adminLoginGate);
        loadAdminProducts(); // Load data, Apps Script will authorize/deny
    } else {
        // If no googleIdToken, it means the Google login hasn't occurred or has expired.
        // Keep the login gate visible.
        hide(adminPanel);
        show(adminLoginGate);
    }

    // This is a simpler logic for UI. The strict authorization happens on Apps Script (Code.gs).
    // The previous password-based login logic is completely removed.
}

/**
 * handleLogin is no longer needed as Google Sign-In manages the login directly.
 * It is kept as a placeholder in case any old event listeners accidentally call it.
 */
async function handleLogin() {
    console.warn("handleLogin() is deprecated. Google Sign-In handles authentication.");
    // This function will no longer contain password logic.
    // The Google Sign-In button directly triggers handleCredentialResponse.
}

/**
 * Handles admin logout. Logs out from Google and clears session.
 */
function handleLogout() {
    googleIdToken = null; // Clear local token
    sessionStorage.removeItem('loggedIn'); // Clear old session storage items
    // Optionally revoke Google session if needed, but signing out of the browser's Google account is usually enough.
    // google.accounts.id.disableAutoSelect(); // If using auto-login
    // google.accounts.id.revoke(googleIdToken, () => {
    //     console.log("Google session revoked.");
    // });
    showCustomAlert('ออกจากระบบแล้ว', 'info');
    checkLoginStatus(); // Update UI
    clearProductForm(); // Clear form data upon logout
}

/**
 * Sets up all event listeners for the admin page.
 */
function setupAdminEventListeners() {
    // Removed loginBtn event listener as it's no longer in HTML
    // Removed passwordInput event listener
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (productForm) productForm.addEventListener('submit', handleProductFormSubmit);
    if (clearBtn) clearBtn.addEventListener('click', clearProductForm);
    if (adminSearchInput) adminSearchInput.addEventListener('input', filterAdminProducts);

    // Event listener for image file input change
    if (imageFileInput) {
        imageFileInput.addEventListener('change', async (event) => {
            const files = event.target.files;
            if (files.length > 0) {
                selectedFileBase64 = []; // Clear previous base64 data
                selectedFileNames = [];
                imagePreviewContainer.innerHTML = ''; // Clear existing previews from previous loads

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const base64Data = e.target.result.split(',')[1]; // Get pure base64 part
                            selectedFileBase64.push(base64Data); // Store for upload
                            selectedFileNames.push(file.name);

                            // Create image preview element for newly selected file
                            const imgDiv = document.createElement('div');
                            imgDiv.classList.add('image-preview-item', 'me-2', 'mb-2');
                            imgDiv.innerHTML = `
                                <img src="${e.target.result}" alt="Preview" class="img-thumbnail" style="width: 100px; height: 100px; object-fit: cover;">
                                <button type="button" class="btn btn-sm btn-danger remove-new-image-btn" data-index="${selectedFileBase64.length - 1}">&times;</button>
                            `;
                            imagePreviewContainer.appendChild(imgDiv);

                            // Add event listener for remove button of newly selected files
                            imgDiv.querySelector('.remove-new-image-btn').addEventListener('click', (e) => {
                                const indexToRemove = parseInt(e.target.dataset.index);
                                showCustomAlert('คุณแน่ใจหรือไม่ที่ต้องการลบรูปภาพนี้?', 'warning', true).then(confirmed => {
                                    if (confirmed) {
                                        selectedFileBase64.splice(indexToRemove, 1);
                                        selectedFileNames.splice(indexToRemove, 1);
                                        // Re-render only newly selected previews to update indices
                                        renderNewImagePreviews();
                                    }
                                });
                            });
                        };
                        reader.readAsDataURL(file);
                    } else {
                        showCustomAlert('ไฟล์ที่เลือกไม่ใช่รูปภาพ', 'warning');
                    }
                }
                // When new files are selected, clear productImages array (existing images)
                // They will be re-added via upload and then merged.
                productImages = [];
            } else {
                // If no files are selected, clear both new and existing image data
                selectedFileBase64 = [];
                selectedFileNames = [];
                productImages = []; // Clear existing images too if file input is cleared
                imagePreviewContainer.innerHTML = '';
            }
        });
    }
}

/**
 * Renders previews for newly selected images in the admin form.
 * Used after removing a newly selected image to re-index buttons.
 */
function renderNewImagePreviews() {
    // Only re-render the "newly selected" part. Existing images should be handled by renderImagePreviews
    imagePreviewContainer.innerHTML = '';

    selectedFileBase64.forEach((base64String, index) => {
        const imgDiv = document.createElement('div');
        imgDiv.classList.add('image-preview-item', 'me-2', 'mb-2');
        imgDiv.innerHTML = `
            <img src="data:image/jpeg;base664,${base64String}" alt="Preview" class="img-thumbnail" style="width: 100px; height: 100px; object-fit: cover;">
            <button type="button" class="btn btn-sm btn-danger remove-new-image-btn" data-index="${index}">&times;</button>
        `;
        imagePreviewContainer.appendChild(imgDiv);

        imgDiv.querySelector('.remove-new-image-btn').addEventListener('click', (e) => {
            const indexToRemove = parseInt(e.target.dataset.index);
            showCustomAlert('คุณแน่ใจหรือไม่ที่ต้องการลบรูปภาพนี้?', 'warning', true).then(confirmed => {
                if (confirmed) {
                    selectedFileBase64.splice(indexToRemove, 1);
                    selectedFileNames.splice(indexToRemove, 1);
                    renderNewImagePreviews();
                }
            });
        });
    });

    // Re-render existing images if they are still in productImages
    if (productImages.length > 0) {
        productImages.forEach((url, index) => {
            const imgDiv = document.createElement('div');
            imgDiv.classList.add('image-preview-item', 'me-2', 'mb-2');
            imgDiv.innerHTML = `
                <img src="${url}" alt="Existing Image" class="img-thumbnail" style="width: 100px; height: 100px; object-fit: cover;">
                <button type="button" class="btn btn-sm btn-danger remove-existing-image-btn" data-index="${index}">&times;</button>
            `;
            imagePreviewContainer.appendChild(imgDiv);

            imgDiv.querySelector('.remove-existing-image-btn').addEventListener('click', (e) => {
                const indexToRemove = parseInt(e.target.dataset.index);
                showCustomAlert('คุณแน่ใจหรือไม่ที่ต้องการลบรูปภาพนี้?', 'warning', true).then(confirmed => {
                    if (confirmed) {
                        productImages.splice(indexToRemove, 1);
                        renderExistingImagePreviews(productImages); // Pass productImages explicitly
                    }
                });
            });
        });
    }
}


/**
 * Renders previews for EXISTING image URLs in the admin form.
 * This is called when loading a product for editing.
 * @param {Array<string>} imageUrls - Array of existing image URLs from the product.
 */
function renderExistingImagePreviews(imageUrls) {
    imagePreviewContainer.innerHTML = ''; // Clear previous previews

    // Ensure productImages array reflects what's being displayed (and potentially saved)
    productImages = imageUrls.map(url => {
        // Convert old Google Drive 'uc' URLs to 'lh3' format for consistency
        if (url.includes('drive.google.com/uc?export=view&id=')) {
            const fileIdMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
            if (fileIdMatch && fileIdMatch[1]) {
                return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
            }
        }
        return url;
    }).filter(url => url); // Filter out any empty/null strings

    productImages.forEach((url, index) => {
        const imgDiv = document.createElement('div');
        imgDiv.classList.add('image-preview-item', 'me-2', 'mb-2');
        imgDiv.innerHTML = `
            <img src="${url}" alt="Preview" class="img-thumbnail" style="width: 100px; height: 100px; object-fit: cover;">
            <button type="button" class="btn btn-sm btn-danger remove-existing-image-btn" data-index="${index}">&times;</button>
        `;
        imagePreviewContainer.appendChild(imgDiv);

        // Add event listener for remove button of existing images
        imgDiv.querySelector('.remove-existing-image-btn').addEventListener('click', (e) => {
            const indexToRemove = parseInt(e.target.dataset.index);
            showCustomAlert('คุณแน่ใจหรือไม่ที่ต้องการลบรูปภาพนี้?', 'warning', true).then(confirmed => {
                if (confirmed) {
                    productImages.splice(indexToRemove, 1);
                    renderExistingImagePreviews(productImages); // Re-render to update indices
                }
            });
        });
    });

    // If no images are left, ensure productImages is empty and file input is cleared
    if (productImages.length === 0) {
        imageFileInput.value = '';
    }
}


/**
 * Handles product form submission (add/edit).
 */
async function handleProductFormSubmit(event) {
    event.preventDefault();

    // Check if user is logged in with Google (this will be implicitly checked by Apps Script)
    // If googleIdToken is null, it means no Google session is active for the UI to show.
    if (!googleIdToken) {
        showCustomAlert('โปรดเข้าสู่ระบบด้วยบัญชี Google ก่อนทำการบันทึกสินค้า', 'warning');
        return;
    }

    const productId = productIdInput.value.trim();
    const name = nameInput.value.trim();
    const category = categoryInput.value.trim();
    const price = parseFloat(priceInput.value);
    const shopeeLink = shopeeLinkInput.value.trim();

    if (!name || !category || isNaN(price) || price < 0) {
        showCustomAlert('โปรดกรอกข้อมูลสินค้าให้ครบถ้วนและถูกต้อง (ชื่อ, หมวดหมู่, ราคา)', 'error');
        return;
    }

    let action = productId ? 'updateProduct' : 'addProduct';
    let data = {
        name: name,
        category: category,
        price: price,
        shopee_url: shopeeLink || '',
    };

    if (productId) {
        data.id = productId;
    }

    show(adminLoader); // Show loader

    try {
        let uploadedImageUrls = [];
        // Upload newly selected images first
        if (selectedFileBase64.length > 0) {
            for (let i = 0; i < selectedFileBase64.length; i++) {
                const imageData = {
                    imageData: selectedFileBase64[i], // Use the pure base64 string
                    fileName: selectedFileNames[i] || `product_image_${Date.now()}_${i}.png`,
                    mimeType: `image/${selectedFileNames[i].split('.').pop()}` // Infer MIME type from extension
                };
                const uploadResponse = await sendData('uploadImage', imageData);
                if (uploadResponse.success && uploadResponse.url) {
                    uploadedImageUrls.push(uploadResponse.url); // Add newly uploaded URL
                } else {
                    showCustomAlert('ไม่สามารถอัปโหลดรูปภาพบางส่วนได้: ' + (uploadResponse.message || 'Unknown error'), 'error');
                    hide(adminLoader);
                    return; // Stop if upload fails
                }
            }
        }

        // Combine existing (and possibly converted) URLs with newly uploaded URLs
        const finalImageUrls = [...productImages, ...uploadedImageUrls];
        data.image_url = finalImageUrls.join(','); // Join all image URLs for submission

        // If adding a new product and no images at all, prompt for image
        if (!productId && finalImageUrls.length === 0) {
            showCustomAlert('กรุณาเลือกรูปภาพสินค้า หรือใส่ลิงก์รูปภาพ', 'warning');
            hide(adminLoader);
            return;
        }


        const response = await sendData(action, data);

        if (response.success) {
            showCustomAlert(`สินค้าถูก${productId ? 'อัปเดต' : 'เพิ่ม'}เรียบร้อยแล้ว!`, 'success');
            clearProductForm(); // Clear form after successful submission
            loadAdminProducts(); // Reload product list
        } else {
            // If the error is an authorization error, prompt user to re-login
            if (response.message && response.message.includes('Unauthorized')) {
                showCustomAlert('การดำเนินการไม่ได้รับอนุญาต โปรดตรวจสอบว่าคุณเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบที่ถูกต้อง', 'error');
                handleLogout(); // Force logout to re-trigger login process
            } else {
                showCustomAlert(`เกิดข้อผิดพลาดในการ${productId ? 'อัปเดต' : 'เพิ่ม'}สินค้า: ` + (response.message || 'Unknown error'), 'error');
            }
        }
    } catch (error) {
        console.error("Error submitting product:", error);
        showCustomAlert('เกิดข้อผิดพลาดในการส่งข้อมูลสินค้า: ' + error.message, 'error');
    } finally {
        hide(adminLoader);
    }
}


/**
 * Clears the product form and resets to add mode.
 */
function clearProductForm() {
    productIdInput.value = '';
    nameInput.value = '';
    categoryInput.value = '';
    priceInput.value = '';
    shopeeLinkInput.value = '';
    imageFileInput.value = ''; // Clear selected file in file input
    imagePreviewContainer.innerHTML = ''; // Clear image preview area
    selectedFileBase664 = []; // Clear base64 data for newly selected files
    selectedFileNames = []; // Clear file names for newly selected files
    productImages = []; // Clear current product images (existing ones)
    formTitle.textContent = 'เพิ่มสินค้าใหม่';
}

/**
 * Loads products for the admin table.
 */
async function loadAdminProducts() {
    show(adminLoader);
    hide(adminProductList);

    try {
        const response = await sendData('getProducts', {}, 'GET'); // getProducts should be allowed for all logged-in users or public
        if (response.success && response.data) {
            adminProducts = response.data;
            renderAdminProducts(adminProducts);
        } else {
            adminProducts = [];
            renderAdminProducts([]);
            // If not authorized for admin tasks (even for getProducts, if doGet were restricted),
            // this message will appear. The backend's doPost is what's truly restricted.
            if (response.message && response.message.includes('Unauthorized')) {
                 showCustomAlert('คุณไม่ได้รับอนุญาตให้เข้าถึงข้อมูลผู้ดูแลระบบ โปรดเข้าสู่ระบบด้วยบัญชีที่ถูกต้อง', 'error');
                 handleLogout(); // Force logout if not authorized
            } else {
                 showCustomAlert('ไม่สามารถโหลดรายการสินค้าได้: ' + (response.message || 'Unknown error'), 'error');
            }
        }
    } catch (error) {
        console.error("Error loading admin products:", error);
        adminProducts = [];
        renderAdminProducts([]);
        showCustomAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อโหลดสินค้า: ' + error.message, 'error');
    } finally {
        hide(adminLoader);
        show(adminProductList);
    }
}

/**
 * Renders the product table for the admin panel.
 * @param {Array<object>} products - Array of product objects.
 */
function renderAdminProducts(products) {
    let tableHtml = `
        <table class="table table-hover admin-product-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>รูปภาพ</th>
                    <th>ชื่อสินค้า</th>
                    <th>หมวดหมู่</th>
                    <th>ราคา</th>
                    <th>ลิงก์ Shopee</th>
                    <th>การกระทำ</th>
                </tr>
            </thead>
            <tbody>
    `;

    if (products.length === 0) {
        tableHtml += `
            <tr>
                <td colspan="7" class="text-center text-muted py-4">ไม่พบสินค้าในระบบ</td>
            </tr>
        `;
    } else {
        products.forEach(product => {
            let imageUrls = [];
            if (product.image_url) {
                imageUrls = String(product.image_url).split(',').map(url => url.trim());
                // Convert old Google Drive 'uc' URLs to 'lh3' format for display in table
                imageUrls = imageUrls.map(url => {
                    if (url.includes('drive.google.com/uc?export=view&id=')) {
                        const fileIdMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
                        if (fileIdMatch && fileIdMatch[1]) {
                            return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
                        }
                    }
                    return url;
                });
            }
            const firstImageUrl = imageUrls[0] || 'https://placehold.co/50x50/cccccc/333333?text=NoImg';

            tableHtml += `
                <tr data-id="${product.id}">
                    <td>${product.id}</td>
                    <td><img src="${firstImageUrl}" alt="${product.name}" class="img-thumbnail" style="width: 50px; height: 50px; object-fit: cover;" onerror="this.onerror=null;this.src='https://placehold.co/50x50/cccccc/333333?text=NoImg';"></td>
                    <td>${product.name}</td>
                    <td>${product.category}</td>
                    <td>฿${parseFloat(product.price).toFixed(2)}</td>
                    <td>${product.shopee_url ? `<a href="${product.shopee_url}" target="_blank" class="btn btn-sm btn-info text-white"><i class="fas fa-external-link-alt"></i></a>` : 'ไม่มี'}</td>
                    <td>
                        <button class="btn btn-warning btn-sm edit-btn" data-id="${product.id}"><i class="fas fa-edit"></i> แก้ไข</button>
                        <button class="btn btn-danger btn-sm delete-btn" data-id="${product.id}"><i class="fas fa-trash"></i> ลบ</button>
                    </td>
                </tr>
            `;
        });
    }

    tableHtml += `
            </tbody>
        </table>
    `;
    adminProductList.innerHTML = tableHtml;

    document.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', (e) => editProduct(e.target.dataset.id));
    });
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', (e) => confirmDeleteProduct(e.target.dataset.id));
    });
}

/**
 * Filters products in the admin table based on search input.
 */
function filterAdminProducts() {
    const searchTerm = adminSearchInput.value.toLowerCase().trim();
    if (searchTerm === '') {
        renderAdminProducts(adminProducts);
        return;
    }

    const filtered = adminProducts.filter(product =>
        (product.id && String(product.id).toLowerCase().includes(searchTerm)) ||
        (product.name && product.name.toLowerCase().includes(searchTerm))
    );
    renderAdminProducts(filtered);
}


/**
 * Populates the form with product data for editing.
 * @param {string} id - The ID of the product to edit.
 */
function editProduct(id) {
    const product = adminProducts.find(p => p.id === id);
    if (product) {
        productIdInput.value = product.id;
        nameInput.value = product.name;
        categoryInput.value = product.category;
        priceInput.value = product.price;
        shopeeLinkInput.value = product.shopee_url || '';
        formTitle.textContent = `แก้ไขสินค้า: ${product.name}`;

        // Clear newly selected files and their previews
        imageFileInput.value = '';
        selectedFileBase64 = [];
        selectedFileNames = [];
        imagePreviewContainer.innerHTML = '';

        // Prepare existing image URLs for display and potential re-saving
        // Convert old Google Drive 'uc' URLs to 'lh3' format here
        productImages = [];
        if (product.image_url) {
            productImages = String(product.image_url).split(',').map(url => url.trim()).map(url => {
                if (url.includes('drive.google.com/uc?export=view&id=')) {
                    const fileIdMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
                    if (fileIdMatch && fileIdMatch[1]) {
                        return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
                    }
                }
                return url;
            }).filter(url => url); // Filter out any empty/null strings
        }
        
        renderExistingImagePreviews(productImages); // Render existing images

        // Scroll to form
        productForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        showCustomAlert('ไม่พบสินค้าที่ต้องการแก้ไข', 'error');
    }
}

/**
 * Confirms product deletion and calls delete function.
 * @param {string} id - The ID of the product to delete.
 */
async function confirmDeleteProduct(id) {
    const productName = (adminProducts.find(p => p.id === id) || {}).name || id;
    const confirm = await showCustomAlert(`คุณแน่ใจหรือไม่ที่ต้องการลบสินค้า "${productName}"?`, 'error', true);
    if (confirm) {
        deleteProduct(id);
    }
}

/**
 * Deletes a product.
 * @param {string} id - The ID of the product to delete.
 */
async function deleteProduct(id) {
    show(adminLoader);
    try {
        const response = await sendData('deleteProduct', { id: id });
        if (response.success) {
            showCustomAlert('สินค้าถูกลบเรียบร้อยแล้ว!', 'success');
            loadAdminProducts();
        } else {
            // If the error is an authorization error, prompt user to re-login
            if (response.message && response.message.includes('Unauthorized')) {
                showCustomAlert('การดำเนินการไม่ได้รับอนุญาต โปรดตรวจสอบว่าคุณเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบที่ถูกต้อง', 'error');
                handleLogout(); // Force logout to re-trigger login process
            } else {
                showCustomAlert('เกิดข้อผิดพลาดในการลบสินค้า: ' + (response.message || 'Unknown error'), 'error');
            }
        }
    } catch (error) {
        console.error("Error deleting product:", error);
        showCustomAlert('เกิดข้อผิดพลาดในการลบสินค้า: ' + error.message, 'error');
    } finally {
        hide(adminLoader);
    }
}
