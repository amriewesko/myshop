// ==========================================================
// =================== CONFIGURATION ========================\
// ==========================================================
// !!! Google Apps Script URL (Deployed Web App URL) !!!
// Make sure this URL is correct and your Apps Script is deployed as a Web App
// IMPORTANT: REPLACE THIS PLACEHOLDER WITH YOUR ACTUAL DEPLOYED GOOGLE APPS SCRIPT URL (e.g., ends with /exec)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzftEVL_lbvkm4rSYlLO1ZMgrruDnLxqdmueih3pKt_QYrSQAuycvlrCnBpsrWZGbba/exec'; // Placeholder, replace with your actual URL

// !!! Admin Secret Key (Must match the one set in Google Apps Script) !!!
// บรรทัดนี้ถูกลบออกไปเพื่อความปลอดภัยสูงสุด
// const ADMIN_SECRET_KEY = '1234';
// ==========================================================

// Global variables to store product data and current states
let allProducts = [];
let currentFilter = 'ทั้งหมด'; // Stores the currently selected category filter
let currentSearchTerm = ''; // Stores the current search query
let selectedFileBase64 = []; // Changed to array to store multiple base64 images of newly selected files
let selectedFileNames = []; // To store file names for newly selected files
let productImages = []; // Stores the CURRENT image URLs of a product (either existing from sheet or newly uploaded) when editing

// ---- Helper Functions ----
/**
 * Safely gets a DOM element by its ID.
 * @param {string} id - The ID of the element.
 * @returns {HTMLElement|null} The element or null if not found.
 */
function getEl(id) {
    return document.getElementById(id);
}

/**
 * Shows a DOM element by removing 'd-none' class.
 * @param {HTMLElement} el - The element to show.
 */
function show(el) {
    if (el) el.classList.remove('d-none');
}

/**
 * Hides a DOM element by adding 'd-none' class.
 * @param {HTMLElement} el - The element to hide.
 */
function hide(el) {
    if (el) el.classList.add('d-none');
}

/**
 * Displays a custom alert message.
 * @param {string} message - The message to display.
 * @param {'success'|'error'|'info'} type - Type of alert.
 * @param {boolean} [isConfirm=false] - If true, shows confirm buttons.
 * @returns {Promise<boolean>} Resolves with true for confirm, false for cancel/close.
 */
function showCustomAlert(message, type = 'info', isConfirm = false) {
    return new Promise(resolve => {
        const modalOverlay = getEl('custom-modal-overlay');
        const modalContent = document.createElement('div');
        modalContent.classList.add('custom-modal-content', `custom-modal-${type}`, 'animate__animated', 'animate__zoomIn');
        
        let iconClass = '';
        if (type === 'success') iconClass = 'fa-check-circle text-success';
        else if (type === 'error') iconClass = 'fa-times-circle text-danger';
        else iconClass = 'fa-info-circle text-primary';

        modalContent.innerHTML = `
            <div class="text-center mb-3">
                <i class="fas ${iconClass} fa-3x"></i>
            </div>
            <p class="text-center mb-4">${message}</p>
            <div class="d-flex justify-content-center gap-3">
                ${isConfirm ? `
                    <button id="modal-confirm-btn" class="btn btn-success btn-lg px-4">ยืนยัน</button>
                    <button id="modal-cancel-btn" class="btn btn-secondary btn-lg px-4">ยกเลิก</button>
                ` : `
                    <button id="modal-ok-btn" class="btn btn-primary btn-lg px-4">ตกลง</button>
                `}
            </div>
        `;

        modalOverlay.innerHTML = ''; // Clear previous content
        modalOverlay.appendChild(modalContent);
        show(modalOverlay);

        const closeAndResolve = (result) => {
            modalContent.classList.remove('animate__zoomIn');
            modalContent.classList.add('animate__zoomOut');
            modalContent.addEventListener('animationend', () => {
                hide(modalOverlay);
                modalOverlay.innerHTML = '';
                resolve(result);
            }, { once: true });
        };

        if (isConfirm) {
            getEl('modal-confirm-btn').onclick = () => closeAndResolve(true);
            getEl('modal-cancel-btn').onclick = () => closeAndResolve(false);
        } else {
            getEl('modal-ok-btn').onclick = () => closeAndResolve(true);
        }

        // Close on outside click for non-confirm modals
        if (!isConfirm) {
            modalOverlay.onclick = (event) => {
                if (event.target === modalOverlay) {
                    closeAndResolve(false);
                }
            };
        }
    });
}


/**
 * Sends data to the Google Apps Script Web App.
 * @param {string} action - The action to perform (e.g., 'getProducts', 'addProduct').
 * @param {Object} [payload={}] - The data payload to send.
 * @returns {Promise<Object>} The JSON response from the Apps Script.
 */
async function sendData(action, payload = {}) {
    // ดึงค่ารหัสลับจาก input field ใน admin.html
    // นี่คือการเปลี่ยนแปลงสำคัญเพื่อความปลอดภัย: รหัสลับจะไม่ถูก hardcode ใน app.js อีกต่อไป
    const adminSecretKeyInput = getEl('adminSecretKeyInput');
    const secretKey = adminSecretKeyInput ? adminSecretKeyInput.value : ''; // ตรวจสอบว่า element มีอยู่จริง

    const fullPayload = {
        action: action,
        secretKey: secretKey, // ส่งรหัสลับไปกับทุก POST request
        data: payload
    };

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors', // Ensure CORS is enabled
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(fullPayload),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error sending data to Apps Script:', error);
        showCustomAlert('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์: ' + error.message, 'error');
        return { success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' };
    }
}

// ---- Product Display and Filtering (index.html) ----
const productGrid = getEl('productGrid');
const categoriesList = getEl('categoriesList');
const searchInput = getEl('searchInput');
const productLoader = getEl('productLoader');
const noProductsMessage = getEl('noProductsMessage');
const backToTopBtn = getEl('back-to-top');

/**
 * Fetches products from Apps Script and renders them.
 */
async function loadProducts() {
    show(productLoader);
    hide(noProductsMessage);
    try {
        const response = await sendData('getProducts', {}, 'GET'); // 'GET' is just for internal logic, not actual HTTP method
        if (response.success) {
            allProducts = response.data;
            filterAndRenderProducts();
        } else {
            showCustomAlert('ไม่สามารถโหลดสินค้าได้: ' + (response.message || 'Unknown error'), 'error');
            show(noProductsMessage);
        }
    } catch (error) {
        showCustomAlert('เกิดข้อผิดพลาดในการโหลดสินค้า: ' + error.message, 'error');
        show(noProductsMessage);
    } finally {
        hide(productLoader);
    }
}

/**
 * Filters products based on current filter and search term, then renders them.
 */
function filterAndRenderProducts() {
    let filteredProducts = allProducts;

    // Apply category filter
    if (currentFilter !== 'ทั้งหมด') {
        filteredProducts = filteredProducts.filter(product => product.category === currentFilter);
    }

    // Apply search filter
    if (currentSearchTerm) {
        const searchTermLower = currentSearchTerm.toLowerCase();
        filteredProducts = filteredProducts.filter(product =>
            product.name.toLowerCase().includes(searchTermLower) ||
            product.category.toLowerCase().includes(searchTermLower)
        );
    }

    renderProductCards(filteredProducts);
}

/**
 * Renders product cards into the product grid.
 * @param {Array<Object>} products - Array of product objects.
 */
function renderProductCards(products) {
    productGrid.innerHTML = ''; // Clear existing products
    if (products.length === 0) {
        show(noProductsMessage);
        return;
    } else {
        hide(noProductsMessage);
    }

    products.forEach(product => {
        const card = document.createElement('div');
        card.classList.add('col-6', 'col-md-4', 'col-lg-3', 'mb-4', 'animate__animated', 'animate__fadeInUp');
        
        // Split image_url by comma and take the first one if multiple
        const imageUrls = product.image_url ? product.image_url.split(',').map(url => url.trim()).filter(url => url) : [];
        const displayImageUrl = imageUrls.length > 0 ? imageUrls[0] : 'https://placehold.co/400x400/cccccc/333333?text=No+Image';

        card.innerHTML = `
            <div class="product-card card h-100 shadow-sm border-0">
                <img src="${displayImageUrl}" class="card-img-top" alt="${product.name}" onerror="this.onerror=null;this.src='https://placehold.co/400x400/cccccc/333333?text=Image+Error';">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title text-truncate-2 mb-2">${product.name}</h5>
                    <p class="card-text text-muted mb-2">${product.category}</p>
                    <p class="price fw-bold text-primary mb-3">฿${product.price.toLocaleString('th-TH')}</p>
                    <div class="mt-auto">
                        <a href="${product.shopee_url}" target="_blank" class="btn btn-accent btn-sm w-100 btn-add-to-cart" ${product.shopee_url ? '' : 'disabled'}>
                            <i class="fas fa-shopping-cart me-2"></i>ซื้อเลย!
                        </a>
                    </div>
                </div>
            </div>
        `;
        // Note: For product.name and product.category, if they were to be displayed directly without being part of innerHTML,
        // using textContent would be ideal. Here, they are embedded within a template literal which is generally safe if
        // the data has been sanitized at the backend (which we've done in Code.gs).
        // If there were any user-generated content directly inserted into the DOM without HTML tags, always use textContent.

        productGrid.appendChild(card);
    });
}

/**
 * Fetches categories from Apps Script and renders category filters.
 */
async function loadCategories() {
    try {
        const response = await sendData('getCategories', {}, 'GET'); // 'GET' is just for internal logic, not actual HTTP method
        if (response.success) {
            renderCategories(response.categories);
        } else {
            console.error('Failed to load categories:', response.message);
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

/**
 * Renders category filter buttons.
 * @param {Array<string>} categories - Array of unique category names.
 */
function renderCategories(categories) {
    categoriesList.innerHTML = ''; // Clear existing categories
    
    // Add "All" category button
    const allBtn = document.createElement('button');
    allBtn.classList.add('btn', 'btn-outline-primary', 'me-2', 'mb-2', 'filter-btn', 'active');
    allBtn.textContent = 'ทั้งหมด';
    allBtn.dataset.category = 'ทั้งหมด';
    categoriesList.appendChild(allBtn);

    // Add other category buttons
    categories.forEach(category => {
        const btn = document.createElement('button');
        btn.classList.add('btn', 'btn-outline-primary', 'me-2', 'mb-2', 'filter-btn');
        btn.textContent = category;
        btn.dataset.category = category;
        categoriesList.appendChild(btn);
    });

    // Add event listener for category filtering
    categoriesList.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList.contains('filter-btn')) {
            // Remove active class from all buttons
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            target.classList.add('active');
            currentFilter = target.dataset.category;
            filterAndRenderProducts();
        }
    });
}

// ---- Admin Panel Functions (admin.html) ----
const loginGate = getEl('login-gate');
const adminPanel = getEl('admin-panel');
const adminSecretKeyInput = getEl('adminSecretKeyInput'); // Ensure this ID exists in admin.html
const adminLoginForm = getEl('adminLoginForm');
const adminProductTableBody = getEl('adminProductTableBody');
const productForm = getEl('productForm');
const productFormTitle = getEl('productFormTitle');
const productIdInput = getEl('productId');
const productNameInput = getEl('productName');
const productCategoryInput = getEl('productCategory');
const productPriceInput = getEl('productPrice');
const productShopeeUrlInput = getEl('productShopeeUrl');
const productImagesInput = getEl('productImages');
const imagePreviewContainer = getEl('imagePreviewContainer');
const productSubmitBtn = getEl('productSubmitBtn');
const productCancelBtn = getEl('productCancelBtn');
const adminLoader = getEl('adminLoader');
const adminNoProductsMessage = getEl('adminNoProductsMessage');

let adminProducts = []; // To store products for admin view

/**
 * Handles admin login.
 * @param {Event} event - The form submit event.
 */
async function handleAdminLogin(event) {
    event.preventDefault();
    showCustomAlert('กำลังตรวจสอบรหัสลับ...', 'info'); // Show info alert during login
    const secretKey = adminSecretKeyInput.value;

    // Simulate sending a request to validate the key.
    // In a real scenario, this might be a specific 'validateKey' action
    // or the first admin action (like loadAdminProducts) will fail if key is wrong.
    // For simplicity, we'll just try to load products, and the backend will validate.
    try {
        const response = await sendData('getProducts', {}); // Try to fetch products, backend validates key
        if (response.success) {
            hide(loginGate);
            show(adminPanel);
            showCustomAlert('เข้าสู่ระบบสำเร็จ!', 'success');
            loadAdminProducts();
        } else {
            showCustomAlert('รหัสลับไม่ถูกต้อง. โปรดลองอีกครั้ง.', 'error');
        }
    } catch (error) {
        showCustomAlert('เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + error.message, 'error');
    }
}

/**
 * Loads products for the admin panel.
 */
async function loadAdminProducts() {
    show(adminLoader);
    hide(adminNoProductsMessage);
    try {
        const response = await sendData('getProducts', {}); // Secret key is sent via sendData
        if (response.success) {
            adminProducts = response.data;
            renderAdminProducts(adminProducts);
        } else {
            showCustomAlert('ไม่สามารถโหลดสินค้าสำหรับผู้ดูแลระบบได้: ' + (response.message || 'Unknown error'), 'error');
            show(adminNoProductsMessage);
        }
    } catch (error) {
        showCustomAlert('เกิดข้อผิดพลาดในการโหลดสินค้าสำหรับผู้ดูแลระบบ: ' + error.message, 'error');
        show(adminNoProductsMessage);
    } finally {
        hide(adminLoader);
    }
}

/**
 * Renders products in the admin table.
 * @param {Array<Object>} products - Array of product objects.
 */
function renderAdminProducts(products) {
    adminProductTableBody.innerHTML = '';
    if (products.length === 0) {
        show(adminNoProductsMessage);
        return;
    } else {
        hide(adminNoProductsMessage);
    }

    products.forEach(product => {
        const row = adminProductTableBody.insertRow();
        row.innerHTML = `
            <td>${product.id}</td>
            <td>${product.name}</td>
            <td>${product.category}</td>
            <td>${product.price.toLocaleString('th-TH')}</td>
            <td>
                ${product.image_url ? product.image_url.split(',').map(url => `<img src="${url}" alt="Product Image" style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px; margin-right: 5px;" onerror="this.onerror=null;this.src='https://placehold.co/50x50/cccccc/333333?text=X';">`).join('') : 'ไม่มีรูป'}
            </td>
            <td>
                <a href="${product.shopee_url}" target="_blank" class="btn btn-sm btn-info" ${product.shopee_url ? '' : 'disabled'}>
                    <i class="fas fa-external-link-alt"></i>
                </a>
            </td>
            <td>
                <button class="btn btn-warning btn-sm me-2" onclick="editProduct('${product.id}')">
                    <i class="fas fa-edit"></i> แก้ไข
                </button>
                <button class="btn btn-danger btn-sm" onclick="confirmDeleteProduct('${product.id}')">
                    <i class="fas fa-trash-alt"></i> ลบ
                </button>
            </td>
        `;
        // Note: For product.id, name, category, price, shopee_url, if they were to be displayed directly without being part of innerHTML,
        // using textContent would be ideal. Here, they are embedded within a template literal which is generally safe if
        // the data has been sanitized at the backend (which we've done in Code.gs).
    });
}

/**
 * Clears the product form.
 */
function clearProductForm() {
    productIdInput.value = '';
    productNameInput.value = '';
    productCategoryInput.value = '';
    productPriceInput.value = '';
    productShopeeUrlInput.value = '';
    productImagesInput.value = ''; // Clear file input
    imagePreviewContainer.innerHTML = ''; // Clear image previews
    selectedFileBase64 = []; // Reset selected files
    selectedFileNames = [];
    productImages = []; // Reset existing images
    productFormTitle.textContent = 'เพิ่มสินค้าใหม่';
    productSubmitBtn.textContent = 'เพิ่มสินค้า';
    productSubmitBtn.classList.remove('btn-warning');
    productSubmitBtn.classList.add('btn-primary');
    hide(productCancelBtn);
    productIdInput.readOnly = false; // Allow ID input for new product (though it's auto-generated)
}

/**
 * Handles file selection for image upload.
 * Converts selected images to Base64.
 * @param {Event} event - The file input change event.
 */
function handleImageSelect(event) {
    const files = event.target.files;
    selectedFileBase64 = [];
    selectedFileNames = [];
    imagePreviewContainer.innerHTML = ''; // Clear existing previews for new selections

    if (files.length > 0) {
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) {
                showCustomAlert(`ไฟล์ "${file.name}" ไม่ใช่ไฟล์รูปภาพ.`, 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64String = e.target.result.split(',')[1]; // Get base64 part
                selectedFileBase64.push({ data: base64String, mimeType: file.type, fileName: file.name });
                selectedFileNames.push(file.name);

                // Display preview
                const imgDiv = document.createElement('div');
                imgDiv.classList.add('image-preview-item');
                imgDiv.innerHTML = `
                    <img src="${e.target.result}" alt="Preview" class="img-thumbnail" style="width: 100px; height: 100px; object-fit: cover; border-radius: 5px;">
                    <button type="button" class="btn btn-danger btn-sm remove-image-btn" data-filename="${file.name}">&times;</button>
                `;
                imagePreviewContainer.appendChild(imgDiv);

                // Add event listener for remove button
                imgDiv.querySelector('.remove-image-btn').onclick = (e) => {
                    const fileNameToRemove = e.target.dataset.filename;
                    selectedFileBase64 = selectedFileBase64.filter(item => item.fileName !== fileNameToRemove);
                    selectedFileNames = selectedFileNames.filter(name => name !== fileNameToRemove);
                    imgDiv.remove();
                };
            };
            reader.readAsDataURL(file);
        });
    }
}

/**
 * Renders existing image URLs for editing.
 * @param {Array<string>} urls - Array of image URLs.
 */
function renderExistingImagePreviews(urls) {
    imagePreviewContainer.innerHTML = ''; // Clear any existing previews
    productImages = urls; // Set current product images

    urls.forEach(url => {
        if (url) {
            const imgDiv = document.createElement('div');
            imgDiv.classList.add('image-preview-item');
            imgDiv.innerHTML = `
                <img src="${url}" alt="Existing Image" class="img-thumbnail" style="width: 100px; height: 100px; object-fit: cover; border-radius: 5px;">
                <button type="button" class="btn btn-danger btn-sm remove-image-btn" data-url="${url}">&times;</button>
            `;
            imagePreviewContainer.appendChild(imgDiv);

            // Add event listener for remove button
            imgDiv.querySelector('.remove-image-btn').onclick = (e) => {
                const urlToRemove = e.target.dataset.url;
                productImages = productImages.filter(item => item !== urlToRemove);
                imgDiv.remove();
            };
        }
    });
}

/**
 * Handles product form submission (add/update).
 * @param {Event} event - The form submit event.
 */
async function handleProductSubmit(event) {
    event.preventDefault();

    const id = productIdInput.value;
    const name = productNameInput.value.trim();
    const category = productCategoryInput.value.trim();
    const price = parseFloat(productPriceInput.value);
    const shopee_url = productShopeeUrlInput.value.trim();

    if (!name || !category || isNaN(price) || price <= 0) {
        showCustomAlert('กรุณากรอกข้อมูลสินค้าให้ครบถ้วนและถูกต้อง (ชื่อ, หมวดหมู่, ราคา).', 'error');
        return;
    }

    show(adminLoader); // Show loader for form submission

    let uploadedImageUrls = [];
    // Upload new images first
    if (selectedFileBase64.length > 0) {
        for (const fileData of selectedFileBase64) {
            try {
                const uploadResponse = await sendData('uploadImage', {
                    imageData: fileData.data,
                    fileName: fileData.fileName,
                    mimeType: fileData.mimeType
                });
                if (uploadResponse.success) {
                    uploadedImageUrls.push(uploadResponse.url);
                } else {
                    showCustomAlert('การอัปโหลดรูปภาพล้มเหลว: ' + (uploadResponse.message || 'Unknown error'), 'error');
                    hide(adminLoader);
                    return; // Stop if image upload fails
                }
            } catch (error) {
                showCustomAlert('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ' + error.message, 'error');
                hide(adminLoader);
                return; // Stop if image upload fails
            }
        }
    }

    // Combine existing images with newly uploaded images
    const finalImageUrls = [...productImages, ...uploadedImageUrls].filter(url => url).join(',');

    const productData = {
        id: id,
        name: name,
        category: category,
        price: price,
        image_url: finalImageUrls,
        shopee_url: shopee_url
    };

    try {
        let response;
        if (id) { // If ID exists, it's an update
            response = await sendData('updateProduct', productData);
        } else { // No ID, it's a new product
            response = await sendData('addProduct', productData);
        }

        if (response.success) {
            showCustomAlert(response.message, 'success');
            clearProductForm();
            loadAdminProducts();
        } else {
            showCustomAlert('เกิดข้อผิดพลาด: ' + (response.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        showCustomAlert('เกิดข้อผิดพลาดในการบันทึกสินค้า: ' + error.message, 'error');
    } finally {
        hide(adminLoader);
    }
}

/**
 * Populates the form with product data for editing.
 * @param {string} id - The ID of the product to edit.
 */
function editProduct(id) {
    const product = adminProducts.find(p => p.id === id);
    if (product) {
        productFormTitle.textContent = 'แก้ไขสินค้า';
        productSubmitBtn.textContent = 'บันทึกการแก้ไข';
        productSubmitBtn.classList.remove('btn-primary');
        productSubmitBtn.classList.add('btn-warning');
        show(productCancelBtn);

        productIdInput.value = product.id;
        productNameInput.value = product.name;
        productCategoryInput.value = product.category;
        productPriceInput.value = product.price;
        productShopeeUrlInput.value = product.shopee_url;
        productIdInput.readOnly = true; // Prevent changing ID when editing

        // Clear newly selected files and names
        selectedFileBase64 = [];
        selectedFileNames = [];
        productImagesInput.value = ''; // Clear file input display

        // Handle existing images
        let productImages = [];
        if (product.image_url) {
            productImages = product.image_url.split(',').map(url => url.trim()).filter(url => url); // Filter out any empty/null strings
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
            showCustomAlert(response.message, 'success');
            loadAdminProducts();
        } else {
            showCustomAlert('เกิดข้อผิดพลาดในการลบสินค้า: ' + (response.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        showCustomAlert('เกิดข้อผิดพลาดในการลบสินค้า: ' + error.message, 'error');
    } finally {
        hide(adminLoader);
    }
}


// ---- Event Listeners and Initial Load ----
document.addEventListener('DOMContentLoaded', () => {
    // For index.html
    if (productGrid) { // Check if on index.html
        loadProducts();
        loadCategories();

        searchInput.addEventListener('input', () => {
            currentSearchTerm = searchInput.value;
            filterAndRenderProducts();
        });

        // Scroll-to-top button logic
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                show(backToTopBtn);
            } else {
                hide(backToTopBtn);
            }
        });
        backToTopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // For admin.html
    if (adminLoginForm) { // Check if on admin.html
        adminLoginForm.addEventListener('submit', handleAdminLogin);
        productImagesInput.addEventListener('change', handleImageSelect);
        productForm.addEventListener('submit', handleProductSubmit);
        productCancelBtn.addEventListener('click', clearProductForm);
        getEl('addProductBtn').addEventListener('click', clearProductForm); // Button to show empty form
    }
});

