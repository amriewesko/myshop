// ==========================================================
// =================== CONFIGURATION ========================
// ==========================================================
// !!! Google Apps Script URL (Deployed Web App URL) !!!
// Make sure this URL is correct and your Apps Script is deployed as a Web App
// IMPORTANT: REPLACE THIS PLACEHOLDER WITH YOUR ACTUAL DEPLOYED GOOGLE APPS SCRIPT URL (e.g., ends with /exec)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyfmGkOiQoC4RvPQbdGP7cRbcCcsKSUggk96AyZGjcHMC7RquVXMrZzANlgL_AyRWLm/exec'; // Placeholder, replace with your actual URL

// !!! Admin Secret Key (Must match the one set in Google Apps Script) !!!
const ADMIN_SECRET_KEY = '1234';
// ==========================================================

// Global variables to store product data and current states
let allProducts = [];
let currentFilter = 'ทั้งหมด'; // Stores the currently selected category filter
let currentSearchTerm = ''; // Stores the current search query
let selectedFileBase64 = []; // Changed to array to store multiple base64 images
let selectedFileNames = []; // To store file names for display
let productImages = []; // Stores image URLs when editing a product
let isEditMode = false; // Flag to indicate if in edit mode


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
 * @param {boolean} isConfirm - If true, shows OK/Cancel buttons.
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
            <div class="custom-modal">
                <div class="custom-modal-header">
                    <h5 class="custom-modal-title">${isConfirm ? 'ยืนยันการกระทำ' : 'แจ้งเตือน'}</h5>
                    <button type="button" class="custom-modal-close" data-bs-dismiss="modal" aria-label="Close">&times;</button>
                </div>
                <div class="custom-modal-body">
                    <p class="text-${type}">${message}</p>
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
        const okButton = modalInstance.querySelector('[data-action="ok"]');
        const cancelButton = modalInstance.querySelector('[data-action="cancel"]');
        const closeButton = modalInstance.querySelector('.custom-modal-close');

        // Function to close the modal and resolve the promise
        const closeModal = (result) => {
            modalInstance.classList.remove('show');
            setTimeout(() => {
                modalInstance.remove(); // Remove from DOM after transition
                resolve(result);
            }, 300); // Match CSS transition duration
        };

        okButton && okButton.addEventListener('click', () => closeModal(true));
        cancelButton && cancelButton.addEventListener('click', () => closeModal(false));
        closeButton && closeButton.addEventListener('click', () => closeModal(false));

        // Show the modal
        setTimeout(() => modalInstance.classList.add('show'), 10); // Small delay to trigger transition
    });
}


/**
 * Sends data to Google Apps Script.
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
            requestBody = {
                secretKey: sessionStorage.getItem('secretKey'),
                action: action,
                data: data
            };
            // Apps Script generally expects text/plain for JSON body
            // Make sure your Apps Script's doPost handles JSON.parse(e.postData.contents)
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
            // Attempt to read response text for more detailed error from Apps Script
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
    const productListEl = getEl('product-list');
    if (!productListEl) return; // Ensure element exists

    productListEl.innerHTML = ''; // Clear existing products
    hide(getEl('loader')); // Hide loader
    hide(getEl('no-results')); // Hide no results message

    if (products.length === 0) {
        show(getEl('no-results')); // Show no results message if no products
        return;
    }

    products.forEach(product => {
        // Construct image URL (assuming image_url holds a single URL or comma-separated URLs)
        const imageUrls = product.image_url ? product.image_url.split(',').map(url => url.trim()) : ['https://placehold.co/400x250?text=No+Image'];
        const firstImageUrl = imageUrls[0]; // Use the first image for the card

        // Determine if it's a mobile product (example: based on category containing 'มือถือ' or similar)
        // You can adjust this logic based on how you define 'featured mobile products'
        const isMobileProduct = product.category && product.category.includes('มือถือ'); // Example condition
        const cardClass = isMobileProduct ? 'product-card mobile' : 'product-card';


        const productCardHtml = `
            <div class="col animate__animated animate__fadeInUp">
                <div class="${cardClass}">
                    <img src="${firstImageUrl}" class="card-img-top" alt="${product.name}">
                    <div class="card-body">
                        <h5 class="card-title">${product.name}</h5>
                        <p class="product-price">฿${parseFloat(product.price).toFixed(2)}</p>
                        ${product.shopee_url ? `<a href="${product.shopee_url}" target="_blank" class="btn btn-shopee"><i class="fas fa-shopping-cart me-2"></i>สั่งซื้อที่ Shopee</a>` : ''}
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

    // Filter by category
    if (currentFilter !== 'ทั้งหมด') {
        filtered = filtered.filter(product =>
            product.category && product.category.toLowerCase().includes(currentFilter.toLowerCase())
        );
    }

    // Search by term
    if (currentSearchTerm) {
        const lowerCaseSearchTerm = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(product =>
            (product.name && product.name.toLowerCase().includes(lowerCaseSearchTerm)) ||
            (product.id && product.id.toLowerCase().includes(lowerCaseSearchTerm)) || // Search by ID as well
            (product.category && product.category.toLowerCase().includes(lowerCaseSearchTerm))
        );
    }

    renderProducts(filtered);
}

/**
 * Loads products from Google Apps Script.
 */
async function loadProducts() {
    const productListEl = getEl('product-list');
    const loaderEl = getEl('loader');
    const noResultsEl = getEl('no-results');

    if (productListEl) productListEl.innerHTML = ''; // Clear previous products
    if (loaderEl) show(loaderEl); // Show loader
    if (noResultsEl) hide(noResultsEl); // Hide no results initially

    try {
        const response = await sendData('getProducts', {}, 'GET');
        if (response.success && response.data) {
            allProducts = response.data;
            filterAndSearchProducts(); // Apply initial filter/search after loading
        } else {
            allProducts = []; // Ensure allProducts is empty on failure
            show(noResultsEl); // Show no results message
            if (response.message) {
                console.error("Failed to load products:", response.message);
                // Optionally show a more specific error alert to the user
                // showCustomAlert('ไม่สามารถโหลดสินค้าได้: ' + response.message, 'error');
            }
        }
    } catch (error) {
        console.error("Error loading products:", error);
        allProducts = [];
        show(noResultsEl); // Show no results on network error
        // showCustomAlert('เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + error.message, 'error');
    } finally {
        if (loaderEl) hide(loaderEl); // Always hide loader
    }
}

// --- Event Listeners for index.html ---
document.addEventListener('DOMContentLoaded', () => {
    // Load products on page load
    loadProducts();

    // Category filter buttons
    document.querySelectorAll('.search-filter-section .btn-group .btn').forEach(button => {
        button.addEventListener('click', function() {
            // Remove 'active' class from all buttons
            document.querySelectorAll('.search-filter-section .btn-group .btn').forEach(btn => btn.classList.remove('active'));
            // Add 'active' class to the clicked button
            this.classList.add('active');
            currentFilter = this.dataset.category; // Update current filter
            filterAndSearchProducts(); // Re-filter products
        });
    });

    // Search input
    const searchInput = getEl('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentSearchTerm = searchInput.value.trim(); // Update search term
            filterAndSearchProducts(); // Re-search products
        });
    }

    // Back to Top button logic
    const backToTopButton = getEl('back-to-top');
    if (backToTopButton) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) { // Show button after scrolling down 300px
                show(backToTopButton);
            } else {
                hide(backToTopButton);
            }
        });
        backToTopButton.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' }); // Smooth scroll to top
        });
    }

    // Smooth scroll for Hero section's "ดูสินค้าทั้งหมด" button
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

    // Admin Page Specific Logic (ONLY runs if on admin.html)
    if (getEl('login-gate') || getEl('admin-panel')) {
        initAdminPage(); // Call admin specific init function
    }
});


// ==========================================================
// ===================== ADMIN PANEL LOGIC ==================
// ==========================================================

// DOM Elements for Admin Panel
const adminLoginGate = getEl('login-gate');
const adminPanel = getEl('admin-panel');
const passwordInput = getEl('password-input');
const loginBtn = getEl('login-btn');
const logoutBtn = getEl('logout-btn');

const productForm = getEl('product-form');
const productIdInput = getEl('product-id');
const nameInput = getEl('name');
const categoryInput = getEl('category');
const priceInput = getEl('price');
const shopeeLinkInput = getEl('shopeeLink');
const imageFileInput = getEl('imageFileInput'); // File input for new images
const imagePreviewContainer = getEl('imagePreview'); // Container for image previews
const imageUrlHiddenInput = getEl('image_url'); // Hidden input to store image URLs (comma-separated)

const formTitle = getEl('form-title');
const clearBtn = getEl('clear-btn');
const adminProductList = getEl('admin-product-list');
const adminSearchInput = getEl('admin-search-input');
const adminLoader = getEl('loader'); // Reusing loader ID for admin page

let adminProducts = []; // Stores products for admin table

// --- Admin Panel Functions ---

/**
 * Initializes the admin page: checks login status, sets up events.
 */
function initAdminPage() {
    checkLoginStatus();
    setupAdminEventListeners();
    loadAdminProducts(); // Load products for admin table on page load
}

/**
 * Checks if the user is logged in (via sessionStorage) and toggles UI.
 */
function checkLoginStatus() {
    if (sessionStorage.getItem('loggedIn') === 'true' && sessionStorage.getItem('secretKey') === ADMIN_SECRET_KEY) {
        show(adminPanel);
        hide(adminLoginGate);
    } else {
        hide(adminPanel);
        show(adminLoginGate);
    }
}

/**
 * Handles admin login.
 */
async function handleLogin() {
    const enteredPassword = passwordInput.value;
    if (enteredPassword === ADMIN_SECRET_KEY) {
        sessionStorage.setItem('loggedIn', 'true');
        sessionStorage.setItem('secretKey', ADMIN_SECRET_KEY);
        showCustomAlert('เข้าสู่ระบบสำเร็จ!', 'success');
        checkLoginStatus();
        passwordInput.value = ''; // Clear password field
        loadAdminProducts(); // Load products after successful login
    } else {
        showCustomAlert('รหัสผ่านไม่ถูกต้อง!', 'error');
    }
}

/**
 * Handles admin logout.
 */
function handleLogout() {
    sessionStorage.removeItem('loggedIn');
    sessionStorage.removeItem('secretKey');
    showCustomAlert('ออกจากระบบแล้ว', 'info');
    checkLoginStatus();
}

/**
 * Sets up all event listeners for the admin page.
 */
function setupAdminEventListeners() {
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (passwordInput) { // Allow Enter key to login
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleLogin();
            }
        });
    }
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (productForm) productForm.addEventListener('submit', handleProductFormSubmit);
    if (clearBtn) clearBtn.addEventListener('click', clearProductForm);
    if (adminSearchInput) adminSearchInput.addEventListener('input', filterAdminProducts);

    // Event listener for image file input change
    if (imageFileInput) {
        imageFileInput.addEventListener('change', async (event) => {
            const files = event.target.files;
            if (files.length > 0) {
                // Clear previous base64 data only if new files are selected
                selectedFileBase64 = [];
                selectedFileNames = [];
                imagePreviewContainer.innerHTML = ''; // Clear existing previews

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const base64String = e.target.result.split(',')[1]; // Get base64 part
                            selectedFileBase64.push(base64String); // Store for upload
                            selectedFileNames.push(file.name);

                            // Create image preview element
                            const imgDiv = document.createElement('div');
                            imgDiv.classList.add('image-preview-item', 'me-2', 'mb-2');
                            imgDiv.innerHTML = `
                                <img src="${e.target.result}" alt="Preview" class="img-thumbnail" style="width: 100px; height: 100px; object-fit: cover;">
                                <button type="button" class="btn btn-sm btn-danger remove-image-btn" data-index="${selectedFileBase64.length - 1}">&times;</button>
                            `;
                            imagePreviewContainer.appendChild(imgDiv);

                            // Add event listener for remove button
                            imgDiv.querySelector('.remove-image-btn').addEventListener('click', (e) => {
                                const indexToRemove = parseInt(e.target.dataset.index);
                                // Remove from arrays
                                selectedFileBase64.splice(indexToRemove, 1);
                                selectedFileNames.splice(indexToRemove, 1);
                                // Re-render previews to update indices
                                renderImagePreviews(selectedFileBase64.map((b64, idx) => `data:image/jpeg;base64,${b64}`));
                            });
                        };
                        reader.readAsDataURL(file);
                    } else {
                        showCustomAlert('ไฟล์ที่เลือกไม่ใช่รูปภาพ', 'warning');
                    }
                }
            } else {
                selectedFileBase64 = [];
                selectedFileNames = [];
                imagePreviewContainer.innerHTML = '';
            }
        });
    }
}

/**
 * Renders image previews in the admin form.
 * This function is crucial for displaying existing images and newly selected ones.
 * @param {Array<string>} imageUrls - Array of image URLs (or base64 strings if newly selected).
 */
function renderImagePreviews(imageUrls) {
    imagePreviewContainer.innerHTML = ''; // Clear existing previews
    productImages = imageUrls; // Update global productImages with currently displayed images

    imageUrls.forEach((url, index) => {
        const imgDiv = document.createElement('div');
        imgDiv.classList.add('image-preview-item', 'me-2', 'mb-2');
        imgDiv.innerHTML = `
            <img src="${url}" alt="Preview" class="img-thumbnail" style="width: 100px; height: 100px; object-fit: cover;">
            <button type="button" class="btn btn-sm btn-danger remove-image-btn" data-index="${index}">&times;</button>
        `;
        imagePreviewContainer.appendChild(imgDiv);

        // Add event listener for remove button
        imgDiv.querySelector('.remove-image-btn').addEventListener('click', (e) => {
            const indexToRemove = parseInt(e.target.dataset.index);
            const confirmation = showCustomAlert('คุณแน่ใจหรือไม่ที่ต้องการลบรูปภาพนี้?', 'warning', true);
            confirmation.then(result => {
                if (result) {
                    // Remove the image URL from the productImages array
                    productImages.splice(indexToRemove, 1);
                    // Re-render previews to update indices and reflect deletion
                    renderImagePreviews(productImages);
                    // Update the hidden image_url input for submission
                    imageUrlHiddenInput.value = productImages.join(',');
                }
            });
        });
    });

    // If no images are left, clear the hidden input
    if (imageUrls.length === 0) {
        imageUrlHiddenInput.value = '';
    }
}


/**
 * Handles product form submission (add/edit).
 */
async function handleProductFormSubmit(event) {
    event.preventDefault();

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
        shopee_url: shopeeLink || '', // Use empty string if no link
        // image_url will be set after upload or from productImages array
    };

    if (productId) {
        data.id = productId;
    }

    show(adminLoader); // Show loader

    try {
        let finalImageUrls = productImages; // Start with existing images

        if (selectedFileBase64.length > 0) {
            // Upload new images first
            for (let i = 0; i < selectedFileBase64.length; i++) {
                const imageData = {
                    file: selectedFileBase64[i],
                    name: selectedFileNames[i] || `product_image_${Date.now()}_${i}.png`
                };
                const uploadResponse = await sendData('uploadImage', imageData);
                if (uploadResponse.success && uploadResponse.url) {
                    finalImageUrls.push(uploadResponse.url); // Add newly uploaded URL
                } else {
                    showCustomAlert('ไม่สามารถอัปโหลดรูปภาพบางส่วนได้: ' + (uploadResponse.message || 'Unknown error'), 'error');
                    hide(adminLoader);
                    return; // Stop if upload fails
                }
            }
            selectedFileBase64 = []; // Clear base64 after upload
            selectedFileNames = [];
            imageFileInput.value = ''; // Clear file input
        }

        data.image_url = finalImageUrls.join(','); // Join all image URLs for submission

        const response = await sendData(action, data);

        if (response.success) {
            showCustomAlert(`สินค้าถูก${productId ? 'อัปเดต' : 'เพิ่ม'}เรียบร้อยแล้ว!`, 'success');
            clearProductForm(); // Clear form after successful submission
            loadAdminProducts(); // Reload product list
        } else {
            showCustomAlert(`เกิดข้อผิดพลาดในการ${productId ? 'อัปเดต' : 'เพิ่ม'}สินค้า: ` + (response.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error("Error submitting product:", error);
        showCustomAlert('เกิดข้อผิดพลาดในการส่งข้อมูลสินค้า: ' + error.message, 'error');
    } finally {
        hide(adminLoader); // Hide loader
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
    imageFileInput.value = ''; // Clear selected file
    imageUrlHiddenInput.value = ''; // Clear hidden image URL
    imagePreviewContainer.innerHTML = ''; // Clear image preview
    selectedFileBase64 = []; // Clear base64 data
    selectedFileNames = [];
    productImages = []; // Clear product images array
    formTitle.textContent = 'เพิ่มสินค้าใหม่';
    isEditMode = false; // Reset edit mode flag
}

/**
 * Loads products for the admin table.
 */
async function loadAdminProducts() {
    show(adminLoader);
    hide(adminProductList); // Hide table while loading

    try {
        const response = await sendData('getProducts', {}, 'GET'); // No secretKey for GET on front-end
        if (response.success && response.data) {
            adminProducts = response.data; // Store for filtering
            renderAdminProducts(adminProducts);
        } else {
            adminProducts = [];
            renderAdminProducts([]); // Render empty table
            showCustomAlert('ไม่สามารถโหลดรายการสินค้าได้: ' + (response.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error("Error loading admin products:", error);
        adminProducts = [];
        renderAdminProducts([]);
        showCustomAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อโหลดสินค้า: ' + error.message, 'error');
    } finally {
        hide(adminLoader);
        show(adminProductList); // Show table area
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
            const imageUrls = product.image_url ? product.image_url.split(',').map(url => url.trim()) : ['https://placehold.co/50x50?text=No+Image'];
            const firstImageUrl = imageUrls[0]; // Display the first image

            tableHtml += `
                <tr data-id="${product.id}">
                    <td>${product.id}</td>
                    <td><img src="${firstImageUrl}" alt="${product.name}" class="img-thumbnail" style="width: 50px; height: 50px; object-fit: cover;"></td>
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

    // Add event listeners for edit and delete buttons after rendering
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
        renderAdminProducts(adminProducts); // Show all if search term is empty
        return;
    }

    const filtered = adminProducts.filter(product =>
        (product.id && product.id.toLowerCase().includes(searchTerm)) ||
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
        isEditMode = true; // Set edit mode flag

        // Clear existing file input and base64 data for new uploads
        imageFileInput.value = '';
        selectedFileBase64 = [];
        selectedFileNames = [];

        // Display existing images for editing
        const existingImageUrls = product.image_url ? product.image_url.split(',').map(url => url.trim()) : [];
        renderImagePreviews(existingImageUrls);

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
            loadAdminProducts(); // Reload product list
        } else {
            showCustomAlert('เกิดข้อผิดพลาดในการลบสินค้า: ' + (response.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error("Error deleting product:", error);
        showCustomAlert('เกิดข้อผิดพลาดในการลบสินค้า: ' + error.message, 'error');
    } finally {
        hide(adminLoader);
    }
}
