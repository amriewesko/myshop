// ==========================================================
// =================== CONFIGURATION ========================\r
// ==========================================================
// !!! Google Apps Script URL (Deployed Web App URL) !!!
// Make sure this URL is correct and your Apps Script is deployed as a Web App
// IMPORTANT: REPLACE THIS PLACEHOLDER WITH YOUR ACTUAL DEPLOYED GOOGLE APPS SCRIPT URL (e.g., ends with /exec)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby2pxvLe4RvklqjrkxjTcxnJjDxM-5Ijo33fC_wFcvbWyL2bJloAWnwBP4u4LvgpXed/exec'; // Placeholder, replace with your actual URL

// ADMIN_SECRET_KEY is now managed by Google Sign-In and Apps Script backend.
// 
// ==========================================================

// Global variables to store product data and current states
let allProducts = [];
let currentFilter = 'ทั้งหมด'; // Stores the currently selected category filter
let currentSearchTerm = ''; // Stores the current search query
let selectedFileBase664 = []; // Changed to array to store multiple base64 images of newly selected files
let selectedFileNames = []; // To store file names for newly selected files
let productImages = []; // Stores the CURRENT image URLs of a product (either existing from sheet or newly uploaded) when editing

// Google Sign-In related variables
let googleIdToken = null; // To store the ID Token after successful Google Sign-In
const ADMIN_AUTHORIZED_EMAIL = '106768013@yru.ac.th'; // ***** แทนที่ด้วยอีเมลผู้ดูแลระบบของคุณ *****

// ---- Helper Functions ----
/**
 * Safely gets a DOM element by its ID.
 * @param {string} id - The ID of the element.
 * @returns {HTMLElement|null} The DOM element or null if not found.
 */
function getById(id) {
    return document.getElementById(id);
}

/**
 * Shows an element by removing the 'd-none' class.
 * @param {HTMLElement} element - The DOM element to show.
 */
function show(element) {
    if (element) element.classList.remove('d-none');
}

/**
 * Hides an element by adding the 'd-none' class.
 * @param {HTMLElement} element - The DOM element to hide.
 */
function hide(element) {
    if (element) element.classList.add('d-none');
}

/**
 * Displays a custom alert message using Bootstrap's modal for better UX.
 * @param {string} message - The message to display.
 * @param {'success'|'error'|'info'} type - Type of message for styling.
 * @param {boolean} [confirm=false] - If true, show a confirmation dialog.
 * @returns {Promise<boolean>} Resolves with true if confirmed, false otherwise.
 */
function showCustomAlert(message, type = 'info', confirm = false) {
    return new Promise((resolve) => {
        const modalOverlay = getById('custom-modal-overlay');
        const modalContent = document.createElement('div');
        modalContent.classList.add('custom-modal-content', 'animate__animated', 'animate__zoomIn');
        modalContent.innerHTML = `
            <div class="card shadow-lg p-4 text-center">
                <i class="fas fa-${type === 'success' ? 'check-circle text-success' : type === 'error' ? 'times-circle text-danger' : 'info-circle text-info'} fa-3x mb-3"></i>
                <p class="mb-4">${message}</p>
                <div class="d-flex justify-content-center">
                    <button id="alert-ok-btn" class="btn btn-${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'primary'} mx-2">OK</button>
                    ${confirm ? '<button id="alert-cancel-btn" class="btn btn-secondary mx-2">ยกเลิก</button>' : ''}
                </div>
            </div>
        `;

        modalOverlay.innerHTML = ''; // Clear previous content
        modalOverlay.appendChild(modalContent);
        show(modalOverlay);

        const okBtn = getById('alert-ok-btn');
        okBtn.onclick = () => {
            hide(modalOverlay);
            resolve(true);
        };

        if (confirm) {
            const cancelBtn = getById('alert-cancel-btn');
            cancelBtn.onclick = () => {
                hide(modalOverlay);
                resolve(false);
            };
        }
    });
}

/**
 * General function to send data to Google Apps Script.
 * @param {string} action - The action to perform (e.g., 'getProducts', 'addProduct').
 * @param {Object} [data={}] - The data payload for the action.
 * @param {boolean} [isGet=false] - Whether to send a GET request (default is POST).
 * @returns {Promise<Object>} The JSON response from the Apps Script.
 */
async function sendData(action, data = {}, isGet = false) {
    const url = new URL(APPS_SCRIPT_URL);
    let requestOptions = {
        method: isGet ? 'GET' : 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8', // Important for Google Apps Script to parse JSON properly
        },
    };

    if (isGet) {
        url.searchParams.append('action', action);
        for (const key in data) {
            url.searchParams.append(key, data[key]);
        }
    } else {
        // Add ID Token for POST requests (admin actions)
        if (googleIdToken) {
            data.idToken = googleIdToken; // Add ID Token to the data payload
        } else {
            // If it's a POST request (admin action) and no token, something is wrong
            // This case should ideally be caught by the login gate
            console.error("Attempted admin action without Google ID Token.");
            throw new Error("Authorization required. Please sign in.");
        }
        data.action = action; // Add action to the data payload for POST
        requestOptions.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url.toString(), requestOptions);
        if (!response.ok) {
            // Attempt to read JSON error first, then fallback to statusText
            const errorText = await response.text();
            let errorMessage = `Server error: ${response.status} ${response.statusText}`;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.message) {
                    errorMessage = errorJson.message;
                }
            } catch (e) {
                // Not a JSON error, use the raw text
                errorMessage = errorText;
            }
            throw new Error(errorMessage);
        }
        const jsonResponse = await response.json();
        return jsonResponse;
    } catch (error) {
        console.error('Error sending data:', error);
        throw error; // Re-throw to be caught by the caller
    }
}

// --- Common Admin DOM Elements ---
const loginGate = getById('login-gate');
const loginStatus = getById('login-status');
const adminContent = getById('admin-content');
const adminProductList = getById('admin-product-list');
const adminLoader = getById('admin-loader');
const adminNoProducts = getById('admin-no-products');
const adminSearchInput = getById('admin-search-input');

const addProductBtn = getById('add-product-btn');
const productFormCard = getById('product-form-card');
const formTitle = getById('form-title');
const productForm = getById('product-form');
const productIdInput = getById('product-id');
const productNameInput = getById('product-name');
const productCategoryInput = getById('product-category');
const productPriceInput = getById('product-price');
const productImagesInput = getById('product-images');
const productShopeeUrlInput = getById('product-shopee-url');
const imagePreviewContainer = getById('image-preview-container');
const cancelEditBtn = getById('cancel-edit-btn');


// --- Google Sign-In Logic ---
/**
 * Callback function for Google Sign-In.
 * @param {Object} response - The credential response from Google.
 */
async function handleCredentialResponse(response) {
    googleIdToken = response.credential;
    console.log("ID Token received:", googleIdToken);

    // Verify ID token with your Apps Script backend
    try {
        const verificationResponse = await sendData('verifyAdminToken', { idToken: googleIdToken });
        if (verificationResponse.success) {
            showCustomAlert(`ยินดีต้อนรับ ${verificationResponse.email} !`, 'success');
            hide(loginGate);
            show(adminContent);
            loadAdminProducts(); // Load products for admin after successful login
        } else {
            googleIdToken = null; // Clear token if verification fails
            show(loginGate); // Show login gate again
            hide(adminContent); // Hide admin content
            loginStatus.textContent = verificationResponse.message || "การตรวจสอบสิทธิ์ล้มเหลว";
            showCustomAlert('การลงชื่อเข้าใช้ล้มเหลว: ' + (verificationResponse.message || 'บัญชีของคุณไม่ได้รับอนุญาต'), 'error');
        }
    } catch (error) {
        googleIdToken = null; // Clear token on error
        show(loginGate); // Show login gate again
        hide(adminContent); // Hide admin content
        loginStatus.textContent = "เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์: " + error.message;
        showCustomAlert('เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์: ' + error.message, 'error');
    }
}

/**
 * Checks if the user is already signed in (if a token exists in session storage/local storage)
 * and attempts to re-verify it.
 * This is a basic check and a full session management would be more complex.
 */
async function checkAdminLoginStatus() {
    // For simplicity, we'll rely on the Google Sign-In library to handle session.
    // The `g_id_onload` div will automatically try to re-authenticate if possible.
    // If handleCredentialResponse is called, it means we got a token.
    // If not, the loginGate will remain visible.
    
    // Initial state: Hide admin content, show login gate
    hide(adminContent);
    show(loginGate);
}


// --- Admin Panel Functions ---

/**
 * Loads and displays products in the admin table.
 */
async function loadAdminProducts() {
    show(adminLoader);
    hide(adminNoProducts);
    adminProductList.innerHTML = ''; // Clear existing list

    try {
        // Fetch products using GET request (no ID token needed for public product list)
        const response = await sendData('getProducts', {}, true); 
        if (response.success && response.data) {
            adminProducts = response.data; // Store for search/edit
            renderAdminProducts(adminProducts);
        } else {
            adminProductList.innerHTML = `<tr><td colspan="8" class="text-center text-danger">${response.message || 'ไม่สามารถโหลดสินค้าได้'}</td></tr>`;
            show(adminNoProducts);
        }
    } catch (error) {
        adminProductList.innerHTML = `<tr><td colspan="8" class="text-center text-danger">เกิดข้อผิดพลาดในการโหลดสินค้า: ${error.message}</td></tr>`;
        show(adminNoProducts);
        console.error('Error loading admin products:', error);
    } finally {
        hide(adminLoader);
    }
}

/**
 * Renders products into the admin table based on the given product array.
 * @param {Array<Object>} productsToRender - Array of product objects.
 */
function renderAdminProducts(productsToRender) {
    adminProductList.innerHTML = ''; // Clear table before rendering
    if (productsToRender.length === 0) {
        show(adminNoProducts);
        return;
    }
    hide(adminNoProducts);

    productsToRender.forEach((product, index) => {
        const row = adminProductList.insertRow();
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${product.id}</td>
            <td>${product.name}</td>
            <td>${product.category}</td>
            <td>${product.price ? product.price.toFixed(2) : 'N/A'}</td>
            <td>${product.image_url ? `<img src="${product.image_url.split(',')[0].trim()}" alt="${product.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px;">` : 'ไม่มีรูปภาพ'}</td>
            <td>${product.shopee_url ? `<a href="${product.shopee_url}" target="_blank">ลิงก์</a>` : 'ไม่มี'}</td>
            <td>
                <button class="btn btn-sm btn-warning me-2 edit-btn" data-id="${product.id}">แก้ไข</button>
                <button class="btn btn-sm btn-danger delete-btn" data-id="${product.id}">ลบ</button>
            </td>
        `;
    });

    // Attach event listeners to new buttons
    adminProductList.querySelectorAll('.edit-btn').forEach(button => {
        button.onclick = (e) => editProduct(e.target.dataset.id);
    });
    adminProductList.querySelectorAll('.delete-btn').forEach(button => {
        button.onclick = (e) => confirmDeleteProduct(e.target.dataset.id);
    });
}

/**
 * Handles product search in the admin panel.
 */
adminSearchInput.oninput = () => {
    const searchTerm = adminSearchInput.value.toLowerCase();
    const filteredProducts = adminProducts.filter(product =>
        (product.id && product.id.toLowerCase().includes(searchTerm)) ||
        (product.name && product.name.toLowerCase().includes(searchTerm)) ||
        (product.category && product.category.toLowerCase().includes(searchTerm))
    );
    renderAdminProducts(filteredProducts);
};

/**
 * Handles "Add New Product" button click.
 */
addProductBtn.onclick = () => {
    productForm.reset();
    productIdInput.value = ''; // Clear hidden ID for new product
    formTitle.textContent = 'เพิ่มสินค้าใหม่';
    productImages = []; // Clear image array for new product
    selectedFileBase664 = []; // Clear newly selected files
    selectedFileNames = [];
    imagePreviewContainer.innerHTML = ''; // Clear image previews
    show(productFormCard);
    productFormCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/**
 * Handles form submission (add/edit product).
 */
productForm.onsubmit = async (e) => {
    e.preventDefault();
    const isEditing = productIdInput.value !== '';
    const action = isEditing ? 'updateProduct' : 'addProduct';

    showCustomAlert('กำลังดำเนินการ...', 'info', false); // Show processing alert

    // Upload newly selected images first
    const newImageUrls = [];
    if (selectedFileBase664.length > 0) {
        for (let i = 0; i < selectedFileBase664.length; i++) {
            try {
                const uploadResponse = await sendData('uploadImage', {
                    imageData: selectedFileBase664[i],
                    fileName: selectedFileNames[i],
                    mimeType: `image/${selectedFileNames[i].split('.').pop()}` // Simple mime type guess
                });
                if (uploadResponse.success && uploadResponse.url) {
                    newImageUrls.push(uploadResponse.url);
                } else {
                    showCustomAlert('ข้อผิดพลาดในการอัปโหลดรูปภาพ: ' + (uploadResponse.message || 'Unknown upload error'), 'error');
                    return; // Stop processing if image upload fails
                }
            } catch (error) {
                showCustomAlert('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ' + error.message, 'error');
                return;
            }
        }
    }

    // Combine existing image URLs with newly uploaded ones
    const finalImageUrls = [...productImages, ...newImageUrls].filter(url => url); // Ensure no nulls/empty strings
    const imageUrlsString = finalImageUrls.join(','); // Join with comma

    const productData = {
        name: productNameInput.value,
        category: productCategoryInput.value,
        price: parseFloat(productPriceInput.value),
        image_url: imageUrlsString,
        shopee_url: productShopeeUrlInput.value
    };

    if (isEditing) {
        productData.id = productIdInput.value;
    }

    try {
        const response = await sendData(action, productData);
        if (response.success) {
            showCustomAlert(`สินค้าถูก${isEditing ? 'แก้ไข' : 'เพิ่ม'}เรียบร้อยแล้ว!`, 'success');
            hide(productFormCard);
            loadAdminProducts();
        } else {
            showCustomAlert(`เกิดข้อผิดพลาดในการ${isEditing ? 'แก้ไข' : 'เพิ่ม'}สินค้า: ` + (response.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        showCustomAlert(`เกิดข้อผิดพลาดในการ${isEditing ? 'แก้ไข' : 'เพิ่ม'}สินค้า: ` + error.message, 'error');
    }
};

/**
 * Handles image file selection.
 */
productImagesInput.onchange = (e) => {
    selectedFileBase664 = []; // Clear previous new selections
    selectedFileNames = [];
    // Do NOT clear productImages here, as it contains existing images
    const files = e.target.files;
    if (files.length > 0) {
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64String = event.target.result.split(',')[1]; // Get base64 part
                selectedFileBase664.push(base64String);
                selectedFileNames.push(file.name);
                // Optionally render preview for newly selected files here if needed
                // For now, renderExistingImagePreviews will handle all images (existing + new after upload)
            };
            reader.readAsDataURL(file);
        });
    }
    // No immediate preview here for new files, will render combined after successful upload.
};

/**
 * Renders image previews for existing images associated with a product.
 * @param {Array<string>} urls - Array of image URLs.
 */
function renderExistingImagePreviews(urls) {
    imagePreviewContainer.innerHTML = ''; // Clear current previews
    urls.forEach(url => {
        if (url) {
            const col = document.createElement('div');
            col.classList.add('col');
            col.innerHTML = `
                <div class="position-relative">
                    <img src="${url}" class="img-thumbnail w-100" style="height: 100px; object-fit: cover;" alt="Product Image">
                    <button type="button" class="btn btn-danger btn-sm remove-image-btn" data-url="${url}" style="position: absolute; top: 5px; right: 5px; border-radius: 50%;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            imagePreviewContainer.appendChild(col);
        }
    });

    // Add event listeners for remove buttons
    imagePreviewContainer.querySelectorAll('.remove-image-btn').forEach(button => {
        button.onclick = (e) => {
            const urlToRemove = e.currentTarget.dataset.url;
            productImages = productImages.filter(url => url !== urlToRemove); // Remove from main array
            renderExistingImagePreviews(productImages); // Re-render previews
        };
    });
}


/**
 * Populates the form for editing an existing product.
 * @param {string} id - The ID of the product to edit.
 */
function editProduct(id) {
    const product = adminProducts.find(p => p.id === id);
    if (product) {
        formTitle.textContent = 'แก้ไขสินค้า';
        productIdInput.value = product.id;
        productNameInput.value = product.name;
        productCategoryInput.value = product.category;
        productPriceInput.value = product.price;
        productShopeeUrlInput.value = product.shopee_url;
        
        show(productFormCard);
        
        // Populate existing images
        productImages = [];
        if (product.image_url) {
            productImages = product.image_url.split(',').map(url => url.trim()).filter(url => url); // Filter out any empty/null strings
        }
        
        renderExistingImagePreviews(productImages); // Render existing images

        // Clear newly selected files when editing existing product
        selectedFileBase664 = [];
        selectedFileNames = [];

        // Scroll to form
        productFormCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const confirm = await showCustomAlert(`คุณแน่ใจหรือไม่ที่ต้องการลบสินค้า \"${productName}\"?`, 'error', true);
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
            showCustomAlert('เกิดข้อผิดพลาดในการลบสินค้า: ' + (response.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        showCustomAlert('เกิดข้อผิดพลาดในการลบสินค้า: ' + error.message, 'error');
        console.error('Error deleting product:', error);
    } finally {
        hide(adminLoader);
    }
}

// --- General Site-wide Functions ---

/**
 * Loads and displays products on the main page.
 */
async function loadProducts() {
    const productGrid = getById('product-grid');
    const productLoader = getById('product-loader');
    const noProductsMsg = getById('no-products-msg');
    
    // Only load if elements exist (i.e., we are on index.html)
    if (!productGrid) return; 

    show(productLoader);
    hide(noProductsMsg);
    productGrid.innerHTML = ''; // Clear previous products

    try {
        const response = await sendData('getProducts', {}, true); // Use GET for public data
        if (response.success && response.data) {
            allProducts = response.data;
            updateCategoryFilters(allProducts); // Update categories first
            filterAndRenderProducts(); // Then filter and render
        } else {
            productGrid.innerHTML = `<p class="text-center text-danger">${response.message || 'ไม่สามารถโหลดสินค้าได้'}</p>`;
            show(noProductsMsg);
        }
    } catch (error) {
        productGrid.innerHTML = `<p class="text-center text-danger">เกิดข้อผิดพลาดในการโหลดสินค้า: ${error.message}</p>`;
        show(noProductsMsg);
        console.error('Error loading products:', error);
    } finally {
        hide(productLoader);
    }
}

/**
 * Filters and renders products based on current search term and category filter.
 */
function filterAndRenderProducts() {
    const productGrid = getById('product-grid');
    const noProductsMsg = getById('no-products-msg');
    if (!productGrid) return;

    let filtered = allProducts;

    // Apply category filter
    if (currentFilter !== 'ทั้งหมด') {
        filtered = filtered.filter(p => p.category === currentFilter);
    }

    // Apply search filter
    if (currentSearchTerm) {
        const searchTermLower = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(p =>
            (p.name && p.name.toLowerCase().includes(searchTermLower)) ||
            (p.category && p.category.toLowerCase().includes(searchTermLower)) ||
            (p.id && p.id.toLowerCase().includes(searchTermLower))
        );
    }

    productGrid.innerHTML = ''; // Clear grid
    if (filtered.length === 0) {
        show(noProductsMsg);
    } else {
        hide(noProductsMsg);
        filtered.forEach(product => {
            const priceDisplay = product.price ? `${product.price.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}` : 'สอบถามราคา';
            const imageUrl = product.image_url ? product.image_url.split(',')[0].trim() : 'https://via.placeholder.com/200?text=No+Image'; // Use first image or placeholder

            const productCard = document.createElement('div');
            productCard.classList.add('col'); // Bootstrap column class
            productCard.innerHTML = `
                <div class="product-card card h-100 shadow-sm animate__animated animate__fadeInUp">
                    <img src="${imageUrl}" class="card-img-top" alt="${product.name}">
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title text-truncate-multiline mb-2">${product.name}</h5>
                        <p class="card-text text-muted mb-1"><i class="fas fa-tag"></i> ${product.category}</p>
                        <p class="card-text price text-primary fw-bold mt-auto mb-2">${priceDisplay}</p>
                        <div class="mt-2">
                            ${product.shopee_url ? `<a href="${product.shopee_url}" target="_blank" class="btn btn-warning btn-sm me-2 btn-add-to-cart"><i class="fas fa-shopping-cart"></i> ดูที่ Shopee</a>` : ''}
                            <button class="btn btn-primary btn-sm btn-add-to-cart" data-id="${product.id}" data-name="${product.name}" data-price="${product.price}" data-img="${imageUrl}" data-shopee="${product.shopee_url || ''}"><i class="fas fa-cart-plus"></i> เพิ่มในตะกร้า</button>
                        </div>
                    </div>
                </div>
            `;
            productGrid.appendChild(productCard);
        });
    }
}

/**
 * Updates category filter buttons.
 */
async function updateCategoryFilters() {
    const categoryFilterContainer = getById('category-filter-container');
    if (!categoryFilterContainer) return; // Only run on index.html

    try {
        const response = await sendData('getCategories', {}, true); // Use GET
        if (response.success && response.categories) {
            let categories = ['ทั้งหมด', ...response.categories];
            categoryFilterContainer.innerHTML = ''; // Clear existing buttons

            categories.forEach(category => {
                const button = document.createElement('button');
                button.classList.add('btn', 'btn-outline-primary', 'category-filter-btn', 'me-2', 'mb-2');
                if (category === currentFilter) {
                    button.classList.add('active');
                }
                button.textContent = category;
                button.onclick = () => {
                    currentFilter = category;
                    categoryFilterContainer.querySelectorAll('.category-filter-btn').forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
                    filterAndRenderProducts();
                };
                categoryFilterContainer.appendChild(button);
            });
        }
    } catch (error) {
        console.error('Error fetching categories:', error);
        // Optionally, show an alert or a default "All" button
    }
}

// Event listener for search input on main page
const searchInput = getById('search-input');
if (searchInput) {
    searchInput.oninput = () => {
        currentSearchTerm = searchInput.value;
        filterAndRenderProducts();
    };
}


// --- Back to Top Button ---
const backToTopButton = getById('back-to-top');
if (backToTopButton) {
    window.onscroll = () => {
        if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
            show(backToTopButton);
        } else {
            hide(backToTopButton);
        }
    };

    backToTopButton.onclick = (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
}


// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
    // Determine if we are on the admin page
    if (document.body.id === 'admin-page') { // Add id="admin-page" to your <body> tag in admin.html
        checkAdminLoginStatus(); // Check Google Sign-In status
    } else {
        loadProducts(); // Load products for the main page
    }
});

// For Admin page only:
if (document.body.id === 'admin-page') {
    // Add these event listeners only on the admin page
    cancelEditBtn.onclick = () => hide(productFormCard);

    // Initial check for admin content visibility (will be handled by checkAdminLoginStatus)
    hide(adminContent); // Initially hide admin content
}

// Function to attach to window.handleCredentialResponse for Google Sign-In
window.handleCredentialResponse = handleCredentialResponse;
