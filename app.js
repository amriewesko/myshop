// ==========================================================
// =================== CONFIGURATION ========================
// ==========================================================
// !!! Google Apps Script URL (Deployed Web App URL) !!!
// ตรวจสอบให้แน่ใจว่า URL นี้ถูกต้องและ Apps Script ของคุณถูก Deploy เป็น Web App แล้ว
// สำคัญ: แทนที่ URL PLACEHOLDER นี้ด้วย URL ที่คุณ Deploy จริงๆ (เช่น ลงท้ายด้วย /exec)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz0EDWKfSdUP4OO2aQgpIBWpFPPPNRGpjDfOpy2fsFgqMJCap2nui12j0e4ocZimCl-/exec'; // แทนที่ด้วย URL ของคุณ

// ==========================================================

// Global variables to store product data and current states
let allProducts = []; // สำหรับเก็บข้อมูลสินค้าทั้งหมดจาก Google Sheet
let currentFilter = 'ทั้งหมด'; // เก็บหมวดหมู่สินค้าที่เลือกปัจจุบัน
let currentSearchTerm = ''; // เก็บคำค้นหาปัจจุบันสำหรับหน้าหลัก
let selectedFileBase64 = []; // เก็บ Base64 ของรูปภาพที่เลือกใหม่ (หลายรูป)
let selectedFileNames = []; // เก็บชื่อไฟล์ของรูปภาพที่เลือกใหม่
let productImages = []; // เก็บ URL รูปภาพปัจจุบันของสินค้าที่กำลังแก้ไข/ดู

// Admin Page specific global variables
let adminProducts = []; // สำหรับเก็บข้อมูลสินค้าในหน้า Admin
let currentAdminPage = 1; // หน้าปัจจุบันของตารางสินค้า Admin
const productsPerPageAdmin = 10; // จำนวนสินค้าต่อหน้าในตาราง Admin
let currentAdminSearchTerm = ''; // เก็บคำค้นหาปัจจุบันสำหรับหน้า Admin

// ---- Helper Functions ----
/**
 * Safely gets a DOM element by its ID.
 * @param {string} id - The ID of the element.
 * @returns {HTMLElement|null} The DOM element or null if not found.
 */
function getEl(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Element with ID '${id}' not found.`);
    }
    return el;
}

/**
 * Shows a DOM element.
 * @param {HTMLElement} el - The element to show.
 */
function show(el) {
    if (el) el.style.display = 'block';
}

/**
 * Hides a DOM element.
 * @param {HTMLElement} el - The element to hide.
 */
function hide(el) {
    if (el) el.style.display = 'none';
}

/**
 * Displays a custom alert message to the user.
 * @param {string} message - The message to display.
 * @param {'success'|'error'|'info'} type - The type of alert (for styling).
 * @param {boolean} [confirm=false] - If true, displays a confirm dialog.
 * @returns {Promise<boolean>} Resolves with true for confirm, false for cancel, or always true for normal alerts.
 */
function showCustomAlert(message, type, confirm = false) {
    return new Promise(resolve => {
        const modalOverlay = getEl('custom-modal-overlay');
        let modal = getEl('custom-alert-modal');

        if (!modal) {
            // Create modal elements if they don't exist
            modal = document.createElement('div');
            modal.id = 'custom-alert-modal';
            modal.className = 'custom-alert-modal';
            modal.innerHTML = `
                <div class="modal-content animate__animated animate__fadeIn">
                    <p id="modal-message"></p>
                    <div class="modal-buttons">
                        <button id="modal-ok-btn" class="btn btn-primary"></button>
                        <button id="modal-cancel-btn" class="btn btn-secondary" style="display: none;">ยกเลิก</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const modalMessage = getEl('modal-message');
        const modalOkBtn = getEl('modal-ok-btn');
        const modalCancelBtn = getEl('modal-cancel-btn');

        modalMessage.textContent = message;
        modalOkBtn.textContent = confirm ? 'ตกลง' : 'ตกลง'; // OK button text

        // Set button styles based on type
        modalOkBtn.className = `btn btn-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary'}`;

        if (confirm) {
            show(modalCancelBtn);
            modalCancelBtn.onclick = () => {
                hide(modal);
                hide(modalOverlay);
                resolve(false);
            };
            modalOkBtn.onclick = () => {
                hide(modal);
                hide(modalOverlay);
                resolve(true);
            };
        } else {
            hide(modalCancelBtn);
            modalOkBtn.onclick = () => {
                hide(modal);
                hide(modalOverlay);
                resolve(true);
            };
        }

        show(modalOverlay);
        show(modal);
    });
}

/**
 * Initializes common UI elements and event listeners for both pages.
 */
function initCommonElements() {
    // Scroll-to-Top Button logic
    const backToTopButton = getEl('back-to-top');
    if (backToTopButton) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) { // Show after scrolling 300px
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
}

// ==========================================================
// ==================== API COMMUNICATION ===================
// ==========================================================

/**
 * Sends data to Google Apps Script.
 * @param {string} action - The action to perform (e.g., 'getProducts', 'addProduct').
 * @param {Object} data - The data payload for the action.
 * @returns {Promise<Object>} The JSON response from Apps Script.
 */
async function sendData(action, data) {
    const adminLoader = getEl('admin-loader');
    if (adminLoader) show(adminLoader); // Show loader for admin actions

    // ดึง idToken จาก localStorage
    const idToken = localStorage.getItem('googleIdToken');
    // สำหรับ action ที่ต้องการการตรวจสอบสิทธิ์ (admin actions)
    // หากไม่มี token หรือ token หมดอายุ จะแจ้งเตือนและพาไปหน้า Login
    if (['addProduct', 'updateProduct', 'deleteProduct', 'uploadImage'].includes(action) && !idToken) {
        hide(adminLoader);
        showCustomAlert('คุณไม่ได้เข้าสู่ระบบหรือ Token หมดอายุ กรุณาล็อกอินใหม่', 'error');
        // รีเฟรชหน้าเพื่อไปที่ Login Gate
        if (window.location.pathname.includes('admin.html')) {
            window.location.reload(); 
        }
        throw new Error("Unauthorized: No token found.");
    }

    const payload = {
        action: action,
        data: data,
        idToken: idToken // ส่ง ID Token ไปยัง Apps Script สำหรับการตรวจสอบสิทธิ์
    };

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            throw new Error(`Server responded with status ${response.status}: ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error sending data to Apps Script:', error);
        showCustomAlert('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์: ' + error.message, 'error');
        throw error;
    } finally {
        if (adminLoader) hide(adminLoader); // Hide loader regardless of success or failure
    }
}

/**
 * Fetches products from Apps Script.
 * @returns {Promise<Array>} Array of product objects.
 */
async function fetchProducts() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getProducts`);
        const result = await response.json();
        if (result.success) {
            return result.data;
        } else {
            console.error('Error fetching products:', result.message);
            showCustomAlert('ไม่สามารถโหลดสินค้าได้: ' + result.message, 'error');
            return [];
        }
    } catch (error) {
        console.error('Network error fetching products:', error);
        showCustomAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อโหลดสินค้า', 'error');
        return [];
    }
}

/**
 * Fetches categories from Apps Script.
 * @returns {Promise<Array>} Array of unique category strings.
 */
async function fetchCategories() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getCategories`);
        const result = await response.json();
        if (result.success) {
            return result.categories;
        } else {
            console.error('Error fetching categories:', result.message);
            showCustomAlert('ไม่สามารถโหลดหมวดหมู่ได้: ' + result.message, 'error');
            return [];
        }
    } catch (error) {
        console.error('Network error fetching categories:', error);
        showCustomAlert('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อโหลดหมวดหมู่', 'error');
        return [];
    }
}


// ==========================================================
// ====================== PUBLIC PAGE LOGIC =================
// ==========================================================

const productList = getEl('product-list');
const categoryFilter = getEl('category-filter');
const searchInput = getEl('search-input');
const noProductsMessage = getEl('no-products-message');
const mainPagination = getEl('main-pagination');

let currentPage = 1;
const productsPerPage = 9;

/**
 * Renders products to the main product list.
 */
function renderProducts() {
    if (!productList) return; // Ensure element exists (for admin page)

    productList.innerHTML = '';
    let filteredProducts = allProducts;

    // Apply category filter
    if (currentFilter !== 'ทั้งหมด') {
        filteredProducts = filteredProducts.filter(p => p.category === currentFilter);
    }

    // Apply search filter
    if (currentSearchTerm) {
        filteredProducts = filteredProducts.filter(p => 
            p.name.toLowerCase().includes(currentSearchTerm) ||
            p.category.toLowerCase().includes(currentSearchTerm)
        );
    }

    if (filteredProducts.length === 0) {
        show(noProductsMessage);
        hide(mainPagination);
        return;
    } else {
        hide(noProductsMessage);
    }

    // Pagination logic
    const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
    const startIndex = (currentPage - 1) * productsPerPage;
    const endIndex = startIndex + productsPerPage;
    const productsToDisplay = filteredProducts.slice(startIndex, endIndex);

    productsToDisplay.forEach(product => {
        const card = document.createElement('div');
        card.className = 'col animate__animated animate__fadeInUp';
        
        // Split image_url string into an array if it contains commas
        const imageUrls = product.image_url ? product.image_url.split(',').map(url => url.trim()) : [];
        const firstImageUrl = imageUrls.length > 0 ? imageUrls[0] : 'https://placehold.co/400x400/cccccc/000000?text=No+Image';

        card.innerHTML = `
            <div class="product-card card h-100 shadow-sm rounded-md">
                <img src="${firstImageUrl}" class="card-img-top" alt="${product.name}" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/400x400/cccccc/000000?text=Image+Error';">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title text-primary fw-bold mb-2 multiline-ellipsis">${product.name}</h5>
                    <p class="card-text text-muted mb-1">${product.category}</p>
                    <p class="card-text price text-accent fw-bolder mt-auto">฿${product.price.toFixed(2)}</p>
                    <div class="d-grid mt-2">
                        <a href="${product.shopee_url || '#'}" target="_blank" class="btn btn-accent btn-add-to-cart rounded-pill animate__animated animate__pulse animate__infinite">
                            <i class="fas fa-shopping-cart me-2"></i> สั่งซื้อสินค้า
                        </a>
                    </div>
                </div>
            </div>
        `;
        productList.appendChild(card);
    });

    renderPagination(totalPages, mainPagination, (page) => {
        currentPage = page;
        renderProducts();
        window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top on page change
    });
    show(mainPagination);
}

/**
 * Renders pagination buttons.
 * @param {number} totalPages - Total number of pages.
 * @param {HTMLElement} paginationContainer - The container for pagination buttons.
 * @param {function(number)} onPageChange - Callback function when page changes.
 */
function renderPagination(totalPages, paginationContainer, onPageChange) {
    paginationContainer.innerHTML = '';
    if (totalPages <= 1) return;

    const createPaginationItem = (text, page, isActive = false, isDisabled = false) => {
        const li = document.createElement('li');
        li.className = `page-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`;
        const a = document.createElement('a');
        a.className = 'page-link';
        a.href = '#';
        a.textContent = text;
        if (!isDisabled) {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                onPageChange(page);
            });
        }
        li.appendChild(a);
        return li;
    };

    // Previous button
    paginationContainer.appendChild(createPaginationItem('ก่อนหน้า', currentPage - 1, false, currentPage === 1));

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        paginationContainer.appendChild(createPaginationItem(i, i, i === currentPage));
    }

    // Next button
    paginationContainer.appendChild(createPaginationItem('ถัดไป', currentPage + 1, false, currentPage === totalPages));
}

/**
 * Loads products and renders them.
 */
async function loadProducts() {
    // Show loader for public products
    const publicLoader = getEl('public-loader'); // Ensure this element exists in index.html
    if (publicLoader) show(publicLoader);

    allProducts = await fetchProducts();
    renderProducts();
    if (publicLoader) hide(publicLoader);
}

/**
 * Loads categories and populates the filter dropdown.
 */
async function loadCategories() {
    if (!categoryFilter) return; // Ensure element exists (for admin page)
    const categories = await fetchCategories();
    categoryFilter.innerHTML = '<option value="ทั้งหมด">ทั้งหมด</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categoryFilter.appendChild(option);
    });
}

/**
 * Adds event listeners for category filters.
 */
function addEventListenersToFilters() {
    if (categoryFilter) {
        categoryFilter.addEventListener('change', () => {
            currentFilter = categoryFilter.value;
            currentPage = 1; // Reset page when filter changes
            renderProducts();
        });
    }
}


// ==========================================================
// ====================== ADMIN PAGE LOGIC ==================
// ==========================================================

// UI elements for Admin Page (will be defined in DOMContentLoaded once elements are present)
let productForm, formTitle, productIdInput, productNameInput, productCategoryInput, productPriceInput, productImageInput, imagePreviewDiv, productShopeeUrlInput, cancelEditButton, adminProductListTableBody, categorySuggestionsDatalist, searchAdminProductsInput, noProductsMessageAdmin;

// Helper to initialize Admin UI elements
function initAdminUIElements() {
    productForm = getEl('product-form');
    formTitle = getEl('form-title');
    productIdInput = getEl('product-id');
    productNameInput = getEl('product-name');
    productCategoryInput = getEl('product-category');
    productPriceInput = getEl('product-price');
    productImageInput = getEl('product-image');
    imagePreviewDiv = getEl('image-preview');
    productShopeeUrlInput = getEl('product-shopee-url');
    cancelEditButton = getEl('cancel-edit-button');
    adminProductListTableBody = getEl('admin-product-list-table')?.querySelector('tbody');
    categorySuggestionsDatalist = getEl('category-suggestions');
    searchAdminProductsInput = getEl('search-admin-products');
    noProductsMessageAdmin = getEl('no-products-message-admin');
}

/**
 * Handles product form submission (Add/Update).
 * @param {Event} event - The form submission event.
 */
async function handleProductFormSubmit(event) {
    event.preventDefault();
    
    // Ensure admin UI elements are initialized
    initAdminUIElements();

    const id = productIdInput.value;
    const name = productNameInput.value;
    const category = productCategoryInput.value;
    const price = parseFloat(productPriceInput.value);
    const shopeeUrl = productShopeeUrlInput.value;

    if (!name || !category || isNaN(price)) {
        showCustomAlert('กรุณากรอกข้อมูลสินค้าให้ครบถ้วนและถูกต้อง', 'error');
        return;
    }

    // Handle image uploads
    let newImageUrls = [];
    if (selectedFileBase64.length > 0) {
        showCustomAlert('กำลังอัปโหลดรูปภาพ...', 'info');
        for (let i = 0; i < selectedFileBase64.length; i++) {
            try {
                const uploadResponse = await sendData('uploadImage', {
                    imageData: selectedFileBase64[i],
                    fileName: selectedFileNames[i],
                    mimeType: selectedFileBase64[i].substring(selectedFileBase64[i].indexOf(':') + 1, selectedFileBase64[i].indexOf(';'))
                });
                if (uploadResponse.success) {
                    newImageUrls.push(uploadResponse.url);
                } else {
                    showCustomAlert('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ' + (uploadResponse.message || 'Unknown error'), 'error');
                    return; // Stop processing if any image upload fails
                }
            } catch (error) {
                showCustomAlert('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ' + error.message, 'error');
                return;
            }
        }
    }

    // Combine existing image URLs with newly uploaded ones
    // Filter out potential empty strings from previous updates or initial data
    const finalImageUrls = productImages.filter(url => url && url.trim() !== ''); // Existing images
    newImageUrls.forEach(url => finalImageUrls.push(url)); // New images
    
    // Convert array of URLs back to a comma-separated string for Google Sheet
    const imageUrlString = finalImageUrls.join(', ');

    const productData = {
        name: name,
        category: category,
        price: price,
        image_url: imageUrlString,
        shopee_url: shopeeUrl
    };

    try {
        let response;
        if (id) {
            // Update existing product
            productData.id = id;
            response = await sendData('updateProduct', productData);
        } else {
            // Add new product
            response = await sendData('addProduct', productData);
        }

        if (response.success) {
            showCustomAlert('สินค้าถูกบันทึกเรียบร้อยแล้ว!', 'success');
            resetProductForm();
            loadAdminProducts();
        } else {
            showCustomAlert('เกิดข้อผิดพลาดในการบันทึกสินค้า: ' + (response.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        showCustomAlert('เกิดข้อผิดพลาดในการส่งข้อมูล: ' + error.message, 'error');
    }
}

/**
 * Renders selected image previews from base64 strings.
 * @param {Array<string>} base64s - Array of base64 image strings.
 */
function renderNewImagePreviews(base64s) {
    if (!imagePreviewDiv) return;
    // Clear only new previews, keep existing ones if any
    const existingPreviews = imagePreviewDiv.querySelectorAll('.existing-image-preview');
    imagePreviewDiv.innerHTML = '';
    existingPreviews.forEach(el => imagePreviewDiv.appendChild(el));

    base64s.forEach((base64, index) => {
        const imgContainer = document.createElement('div');
        imgContainer.className = 'col-6 col-md-4 col-lg-3 position-relative';
        imgContainer.innerHTML = `
            <img src="${base64}" class="img-fluid rounded shadow-sm new-image-preview" alt="Preview" style="aspect-ratio: 1/1; object-fit: cover;">
            <button type="button" class="btn btn-danger btn-sm rounded-circle position-absolute top-0 end-0 m-1 remove-new-image-btn" data-index="${index}"><i class="fas fa-times"></i></button>
        `;
        imagePreviewDiv.appendChild(imgContainer);
    });

    imagePreviewDiv.querySelectorAll('.remove-new-image-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const indexToRemove = parseInt(e.target.closest('.remove-new-image-btn').dataset.index);
            removeNewImage(indexToRemove);
        });
    });
}

/**
 * Removes a newly selected image from previews and arrays.
 * @param {number} index - Index of the image to remove.
 */
function removeNewImage(index) {
    selectedFileBase64.splice(index, 1);
    selectedFileNames.splice(index, 1);
    renderNewImagePreviews(selectedFileBase64);
    // If no new images are left, clear the file input
    if (selectedFileBase64.length === 0 && productImageInput) {
        productImageInput.value = '';
    }
}

/**
 * Renders existing image URLs for a product being edited.
 * @param {Array<string>} urls - Array of existing image URLs.
 */
function renderExistingImagePreviews(urls) {
    if (!imagePreviewDiv) return;
    // Clear all previews first to redraw
    imagePreviewDiv.innerHTML = '';

    urls.forEach((url, index) => {
        if (!url || url.trim() === '') return; // Skip empty URLs
        const imgContainer = document.createElement('div');
        imgContainer.className = 'col-6 col-md-4 col-lg-3 position-relative existing-image-preview';
        imgContainer.innerHTML = `
            <img src="${url}" class="img-fluid rounded shadow-sm" alt="Existing Image" style="aspect-ratio: 1/1; object-fit: cover;">
            <button type="button" class="btn btn-danger btn-sm rounded-circle position-absolute top-0 end-0 m-1 remove-existing-image-btn" data-index="${index}"><i class="fas fa-times"></i></button>
        `;
        imagePreviewDiv.appendChild(imgContainer);
    });

    imagePreviewDiv.querySelectorAll('.remove-existing-image-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const indexToRemove = parseInt(e.target.closest('.remove-existing-image-btn').dataset.index);
            removeExistingImage(indexToRemove);
        });
    });
}

/**
 * Removes an existing image from previews and the productImages array.
 * @param {number} index - Index of the image to remove.
 */
function removeExistingImage(index) {
    if (index > -1 && index < productImages.length) {
        productImages.splice(index, 1);
        renderExistingImagePreviews(productImages); // Re-render existing images
        showCustomAlert('รูปภาพถูกลบออกจากการแก้ไขแล้ว (จะถูกบันทึกเมื่อกดปุ่มบันทึกสินค้า)', 'info');
    }
}

/**
 * Resets the product form to add new product mode.
 */
function resetProductForm() {
    if (!productForm) return; // Ensure element exists

    productForm.reset();
    productIdInput.value = '';
    formTitle.textContent = 'เพิ่มสินค้าใหม่';
    hide(cancelEditButton);
    imagePreviewDiv.innerHTML = ''; // Clear all image previews
    selectedFileBase64 = []; // Clear new image data
    selectedFileNames = [];
    productImages = []; // Clear existing image URLs
    productImageInput.value = ''; // Clear file input
}

/**
 * Reads selected image files and converts them to Base64.
 * @param {Event} event - The file input change event.
 */
async function handleImageSelection(event) {
    const files = event.target.files;
    selectedFileBase64 = [];
    selectedFileNames = [];

    if (files.length === 0) {
        imagePreviewDiv.innerHTML = '';
        return;
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
            try {
                const base64String = await readFileAsBase64(file);
                selectedFileBase64.push(base64String);
                selectedFileNames.push(file.name);
            } catch (error) {
                console.error("Error reading file as Base64:", error);
                showCustomAlert(`ไม่สามารถอ่านไฟล์ ${file.name} ได้: ${error.message}`, 'error');
            }
        } else {
            showCustomAlert(`ไฟล์ ${file.name} ไม่ใช่รูปภาพ`, 'warning');
        }
    }
    renderNewImagePreviews(selectedFileBase64); // Render newly selected images
}

/**
 * Reads a File object as a Base64 string.
 * @param {File} file - The File object to read.
 * @returns {Promise<string>} A Promise that resolves with the Base64 string.
 */
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]); // Get only the base64 part
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

/**
 * Loads products for the admin table.
 */
async function loadAdminProducts() {
    if (!adminProductListTableBody) return; // Ensure element exists

    adminProducts = await fetchProducts();
    renderAdminProducts();
    loadCategorySuggestions(); // Refresh category suggestions for form
}

/**
 * Renders products in the admin table.
 */
function renderAdminProducts() {
    if (!adminProductListTableBody) return; // Ensure element exists
    
    adminProductListTableBody.innerHTML = '<tr><td colspan="6" class="text-center">กำลังโหลดสินค้า...</td></tr>'; // Show loading

    let filteredAdminProducts = adminProducts;

    if (currentAdminSearchTerm) {
        filteredAdminProducts = filteredAdminProducts.filter(p =>
            p.name.toLowerCase().includes(currentAdminSearchTerm) ||
            p.category.toLowerCase().includes(currentAdminSearchTerm) ||
            p.id.toLowerCase().includes(currentAdminSearchTerm)
        );
    }

    if (filteredAdminProducts.length === 0) {
        adminProductListTableBody.innerHTML = ''; // Clear loading message
        show(noProductsMessageAdmin);
        // hide(adminPagination); // If you add pagination for admin table
        return;
    } else {
        hide(noProductsMessageAdmin);
    }

    adminProductListTableBody.innerHTML = ''; // Clear loading message

    // Pagination for admin table (if desired, currently displays all filtered)
    // const totalAdminPages = Math.ceil(filteredAdminProducts.length / productsPerPageAdmin);
    // const startIndex = (currentAdminPage - 1) * productsPerPageAdmin;
    // const endIndex = startIndex + productsPerPageAdmin;
    // const productsToDisplay = filteredAdminProducts.slice(startIndex, endIndex);

    filteredAdminProducts.forEach(product => {
        const row = adminProductListTableBody.insertRow();
        
        // Split image_url string into an array if it contains commas
        const imageUrls = product.image_url ? product.image_url.split(',').map(url => url.trim()) : [];
        const firstImageUrl = imageUrls.length > 0 ? imageUrls[0] : 'https://placehold.co/50x50/cccccc/000000?text=No+Img';

        row.innerHTML = `
            <td><img src="${firstImageUrl}" alt="${product.name}" class="img-thumbnail" style="width: 50px; height: 50px; object-fit: cover;" onerror="this.onerror=null;this.src='https://placehold.co/50x50/cccccc/000000?text=Error';"></td>
            <td>${product.id}</td>
            <td>${product.name}</td>
            <td>${product.category}</td>
            <td>฿${product.price.toFixed(2)}</td>
            <td>
                <button class="btn btn-warning btn-sm me-2 edit-btn" data-id="${product.id}"><i class="fas fa-edit"></i> แก้ไข</button>
                <button class="btn btn-danger btn-sm delete-btn" data-id="${product.id}"><i class="fas fa-trash-alt"></i> ลบ</button>
            </td>
        `;
    });

    adminProductListTableBody.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', (e) => editProduct(e.currentTarget.dataset.id));
    });

    adminProductListTableBody.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', (e) => confirmDeleteProduct(e.currentTarget.dataset.id));
    });
}

/**
 * Loads categories for the admin form's datalist.
 */
async function loadCategorySuggestions() {
    if (!categorySuggestionsDatalist) return; // Ensure element exists
    const categories = await fetchCategories();
    categorySuggestionsDatalist.innerHTML = '';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        categorySuggestionsDatalist.appendChild(option);
    });
}

/**
 * Populates the form for editing a product.
 * @param {string} id - The ID of the product to edit.
 */
async function editProduct(id) {
    if (!productForm) return; // Ensure element exists

    const productToEdit = adminProducts.find(p => p.id === id);
    if (productToEdit) {
        show(cancelEditButton);
        formTitle.textContent = 'แก้ไขสินค้า';
        productIdInput.value = productToEdit.id;
        productNameInput.value = productToEdit.name;
        productCategoryInput.value = productToEdit.category;
        productPriceInput.value = productToEdit.price;
        productShopeeUrlInput.value = productToEdit.shopee_url;
        
        // Populate productImages array with existing URLs
        if (productToEdit.image_url) {
            productImages = productToEdit.image_url.split(',').map(url => url.trim()).filter(url => url); // Filter out any empty/null strings
        } else {
            productImages = [];
        }
        selectedFileBase64 = []; // Clear any newly selected files
        selectedFileNames = [];
        productImageInput.value = ''; // Clear file input (visual only)

        renderExistingImagePreviews(productImages); // Render existing images
        renderNewImagePreviews(selectedFileBase64); // Ensure no new previews are shown initially when editing

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
    }
}


// ==========================================================
// ==================== ADMIN LOGIN & LOGOUT ===================
// ==========================================================

let currentUserEmail = null; // Store the email of the logged-in admin

/**
 * Handles the Google Sign-In credential response.
 * This function is called by the Google Identity Services Library after successful login.
 * @param {Object} response - The credential response object from Google. Contains idToken.
 */
async function handleCredentialResponse(response) {
    const idToken = response.credential;
    localStorage.setItem('googleIdToken', idToken); // Save token to localStorage

    const loginErrorDiv = getEl('login-error');
    const adminLoader = getEl('admin-loader'); // Ensure this element exists in admin.html or is mocked

    if (adminLoader) show(adminLoader); // Show loader during verification

    try {
        // Decode token to get user email for client-side display/tracking
        const decodedToken = parseJwt(idToken);
        currentUserEmail = decodedToken.email; // Store email

        // Optimistically show admin content and rely on backend for actual authorization
        // The backend Apps Script (doPost) will perform the definitive check using verifyAndAuthorizeUser
        hide(loginGate);
        show(adminContent);
        show(logoutButton); // Show logout button
        showCustomAlert('เข้าสู่ระบบสำเร็จ!', 'success');
        
        // Initialize Admin UI elements after content is shown
        initAdminUIElements(); 
        loadAdminProducts(); // Load admin products after successful login
        loadCategorySuggestions(); // Load category suggestions for the form

        // Add event listeners for admin page elements
        productForm.addEventListener('submit', handleProductFormSubmit);
        cancelEditButton.addEventListener('click', resetProductForm);
        productImageInput.addEventListener('change', handleImageSelection);
        searchAdminProductsInput.addEventListener('input', () => {
            currentAdminSearchTerm = searchAdminProductsInput.value.toLowerCase();
            renderAdminProducts();
        });


    } catch (error) {
        if (adminLoader) hide(adminLoader);
        loginErrorDiv.textContent = 'การยืนยันตัวตนล้มเหลว กรุณาลองอีกครั้ง';
        show(loginErrorDiv);
        console.error('Login error:', error);
        localStorage.removeItem('googleIdToken'); // Clear token if verification fails
        hide(adminContent);
        show(loginGate);
        hide(logoutButton);
    } finally {
        if (adminLoader) hide(adminLoader);
    }
}

/**
 * Parses a JWT token to extract its payload.
 * @param {string} token - The JWT token string.
 * @returns {Object} The decoded payload (e.g., { email, name, picture, exp, etc. }).
 */
function parseJwt (token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

/**
 * Handles admin logout. Clears local storage token and resets UI.
 */
function logoutAdmin() {
    // Clear token from localStorage
    localStorage.removeItem('googleIdToken');
    currentUserEmail = null;

    // Optional: Sign out from Google Identity Services
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
         google.accounts.id.disableAutoSelect(); // Prevent automatic re-login
         // If you need to revoke consent for the current account:
         // If you had a 'sub' (user ID) from the decoded token:
         // const decodedToken = parseJwt(localStorage.getItem('googleIdToken'));
         // if (decodedToken && decodedToken.sub) {
         //    google.accounts.id.revoke(decodedToken.sub, done => {
         //        console.log('Consent revoked for:', done.email);
         //        // Perform UI changes after revoke if needed
         //    });
         // }
    }

    // Reset UI to show login screen
    hide(adminContent);
    show(loginGate);
    hide(logoutButton);
    showCustomAlert('ออกจากระบบเรียบร้อยแล้ว', 'info');
    console.log('Admin logged out.');
}


// ==========================================================
// ===================== INITIALIZATION =====================
// ==========================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize common elements for both index and admin pages
    initCommonElements();

    // Elements specific to admin page. Get them here as they are needed for login logic.
    const loginGate = getEl('login-gate');
    const adminContent = getEl('admin-content');
    const logoutButton = getEl('logout-button');
    const adminLoader = getEl('admin-loader'); // If you have a loader div in admin.html

    // Logic for the public (index.html) page
    if (getEl('product-list')) { // Check if it's the index page based on product-list presence
        // show(getEl('public-loader')); // Show loader for public page
        loadProducts();
        loadCategories();
        addEventListenersToFilters();
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                currentSearchTerm = searchInput.value.toLowerCase();
                renderProducts(); // Re-render products based on current search and filter
            });
        }
    }

    // Logic for the Admin (admin.html) page
    if (adminContent && loginGate) { // Check if it's the admin page based on presence of admin-content and login-gate divs
        initAdminUIElements(); // Initialize Admin UI elements for global access

        const idToken = localStorage.getItem('googleIdToken');

        if (idToken) {
            // If token exists, optimistically show admin content
            hide(loginGate);
            show(adminContent);
            show(logoutButton);
            
            // Try to load admin products. Backend will verify the token.
            // If backend verification fails, an error will be shown and user will be logged out.
            loadAdminProducts(); 
            loadCategorySuggestions(); 

            // Add event listeners for admin page elements
            if (productForm) productForm.addEventListener('submit', handleProductFormSubmit);
            if (cancelEditButton) cancelEditButton.addEventListener('click', resetProductForm);
            if (productImageInput) productImageInput.addEventListener('change', handleImageSelection);
            if (searchAdminProductsInput) {
                searchAdminProductsInput.addEventListener('input', () => {
                    currentAdminSearchTerm = searchAdminProductsInput.value.toLowerCase();
                    renderAdminProducts();
                });
            }
            
        } else {
            // No token found, show login gate
            show(loginGate);
            hide(adminContent);
            hide(logoutButton);
        }

        // Event listener for the logout button (always available on admin page if present)
        if (logoutButton) {
            logoutButton.addEventListener('click', logoutAdmin);
        }
    }
});
