// ==========================================================
// =================== CONFIGURATION ========================
// ==========================================================
// !!! Google Apps Script URL (Deployed Web App URL) !!!
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxGaz_iTiJxhoZionkZ_99Ff9na7gEQ5njSDMGvKHouBZX0DLUAi4qYhL3B-KWG_AEX/exec';
// ==========================================================

// Global variables
let allProducts = [];
let currentFilter = 'ทั้งหมด';
let currentSearchTerm = '';
let selectedFileBase64 = [];
let selectedFileNames = [];
let productImages = [];

// ---- Helper and Security Functions ----
const getEl = (id) => document.getElementById(id);
const show = (el) => el && el.classList.remove('d-none');
const hide = (el) => el && el.classList.add('d-none');

/**
 * Converts special characters to HTML entities to prevent XSS.
 * @param {string | number} str The string to sanitize.
 * @returns {string} The sanitized string.
 */
const sanitizeHTML = (str) => {
    const temp = document.createElement('div');
    temp.textContent = String(str);
    return temp.innerHTML;
};


function showCustomAlert(message, type = 'info', isConfirm = false) {
    return new Promise((resolve) => {
        // ... (The showCustomAlert function remains unchanged from your original file) ...
    });
}

async function sendData(action, data = {}, method = 'POST') {
    try {
        if (method === 'GET') {
            const url = new URL(APPS_SCRIPT_URL);
            url.searchParams.append('action', action);
            Object.keys(data).forEach(key => url.searchParams.append(key, data[key]));
            const response = await fetch(url.toString());
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } else {
            // For POST requests, include the auth token
            const requestBody = {
                action: action,
                data: data
            };
            // Add auth token if it exists and action is not 'login'
            const authToken = sessionStorage.getItem('authToken');
            if (action !== 'login' && authToken) {
                requestBody.authToken = authToken;
            }

            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}. Response: ${errorText}`);
            }
            return await response.json();
        }
    } catch (error) {
        console.error("Send Data API Error:", error);
        showCustomAlert('เกิดข้อผิดพลาดในการส่งข้อมูล: ' + error.message, 'error');
        return { success: false, message: error.message };
    }
}


// ---- Product Management (Public Page) ----

function renderProducts(products) {
    const productListEl = getEl('product-list-container');
    if (!productListEl) return;
    productListEl.innerHTML = '';
    hide(getEl('loader'));
    hide(getEl('no-products-found'));

    if (products.length === 0) {
        show(getEl('no-products-found'));
        return;
    }

    products.forEach(product => {
        let imageUrls = (product.image_url) ? String(product.image_url).split(',').map(url => url.trim()) : [];
        const firstImageUrl = imageUrls[0] || 'https://placehold.co/400x250/cccccc/333333?text=No+Image';

        const sanitizedName = sanitizeHTML(product.name);
        const sanitizedPrice = sanitizeHTML(parseFloat(product.price).toFixed(2));

        const productCardHtml = `
            <div class="col animate__animated animate__fadeInUp">
                <div class="product-card">
                    <img src="${firstImageUrl}" class="card-img-top" alt="${sanitizedName}" onerror="this.onerror=null;this.src='https://placehold.co/400x250/cccccc/333333?text=No+Image';">
                    <div class="card-body">
                        <h5 class="card-title">${sanitizedName}</h5>
                        <p class="product-price">฿${sanitizedPrice}</p>
                        ${product.shopee_url ? `<a href="${sanitizeHTML(product.shopee_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-add-to-cart"><i class="fas fa-shopping-cart me-2"></i>สั่งซื้อที่ SHOPEE</a>` : ''}
                    </div>
                </div>
            </div>`;
        productListEl.insertAdjacentHTML('beforeend', productCardHtml);
    });
}


function filterAndSearchProducts() {
    let filtered = allProducts;
    if (currentFilter !== 'ทั้งหมด') {
        filtered = filtered.filter(p => p.category && p.category.toLowerCase() === currentFilter.toLowerCase());
    }
    if (currentSearchTerm) {
        const lowerCaseSearchTerm = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(p =>
            (p.name && p.name.toLowerCase().includes(lowerCaseSearchTerm)) ||
            (p.id && String(p.id).toLowerCase().includes(lowerCaseSearchTerm)) ||
            (p.category && p.category.toLowerCase().includes(lowerCaseSearchTerm))
        );
    }
    renderProducts(filtered);
}

async function loadProducts() {
    const loaderEl = getEl('loader');
    if (loaderEl) show(loaderEl);
    try {
        const response = await sendData('getProducts', {}, 'GET');
        if (response.success && response.data) {
            allProducts = response.data;
            filterAndSearchProducts();
        } else {
            allProducts = [];
            show(getEl('no-products-found'));
        }
    } catch (error) {
        console.error("Error loading products:", error);
        allProducts = [];
        show(getEl('no-products-found'));
    } finally {
        if (loaderEl) hide(loaderEl);
    }
}

async function fetchAndRenderCategories() {
    const categorySelect = getEl('category-select');
    if (!categorySelect) return;
    const result = await sendData('getCategories', {}, 'GET');
    if (result.success && result.categories) {
        // Clear old options except the first one
        while (categorySelect.options.length > 1) {
            categorySelect.remove(1);
        }
        result.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = sanitizeHTML(category);
            categorySelect.appendChild(option);
        });
    }
}


// ---- Admin Panel Logic ----
function initAdminPage() {
    checkLoginStatus();
    setupAdminEventListeners();
    if (sessionStorage.getItem('loggedIn') === 'true') {
        loadAdminProducts();
    }
}

function checkLoginStatus() {
    const adminPanel = getEl('admin-panel');
    const loginGate = getEl('login-gate');
    const logoutBtnContainer = getEl('logout-btn-container');

    if (sessionStorage.getItem('loggedIn') === 'true' && sessionStorage.getItem('authToken')) {
        show(adminPanel);
        hide(loginGate);
        show(logoutBtnContainer);
    } else {
        hide(adminPanel);
        show(loginGate);
        hide(logoutBtnContainer);
    }
}

async function handleLogin() {
    const passwordInput = getEl('password-input');
    const enteredPassword = passwordInput.value;
    if (!enteredPassword) {
        showCustomAlert('กรุณากรอกรหัสผ่าน', 'warning');
        return;
    }
    try {
        const response = await sendData('login', { password: enteredPassword });
        if (response.success && response.token) {
            sessionStorage.setItem('loggedIn', 'true');
            sessionStorage.setItem('authToken', response.token);
            showCustomAlert('เข้าสู่ระบบสำเร็จ!', 'success');
            checkLoginStatus();
            passwordInput.value = '';
            loadAdminProducts();
        } else {
            showCustomAlert('รหัสผ่านไม่ถูกต้อง!', 'error');
        }
    } catch (error) {
        showCustomAlert('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    }
}

function handleLogout() {
    sessionStorage.removeItem('loggedIn');
    sessionStorage.removeItem('authToken');
    showCustomAlert('ออกจากระบบแล้ว', 'info');
    checkLoginStatus();
    // Optional: clear admin products from view
    const adminProductList = getEl('admin-product-list');
    if (adminProductList) adminProductList.innerHTML = '';
}


async function handleProductFormSubmit(event) {
    event.preventDefault();
    const productId = getEl('product-id').value.trim();
    const name = getEl('name').value.trim();
    const category = getEl('category').value.trim();
    const price = parseFloat(getEl('price').value);
    const shopeeLink = getEl('shopeeLink').value.trim();

    if (!name || !category || isNaN(price) || price < 0) {
        showCustomAlert('โปรดกรอกข้อมูลสินค้าให้ครบถ้วนและถูกต้อง (ชื่อ, หมวดหมู่, ราคา)', 'error');
        return;
    }

    const adminLoader = getEl('loader');
    show(adminLoader);

    try {
        let uploadedImageUrls = [];
        if (selectedFileBase64.length > 0) {
            for (let i = 0; i < selectedFileBase64.length; i++) {
                const imageData = {
                    imageData: selectedFileBase64[i],
                    fileName: selectedFileNames[i],
                    mimeType: `image/${selectedFileNames[i].split('.').pop()}`
                };
                const uploadResponse = await sendData('uploadImage', imageData);
                if (uploadResponse.success && uploadResponse.url) {
                    uploadedImageUrls.push(uploadResponse.url);
                } else {
                    throw new Error('ไม่สามารถอัปโหลดรูปภาพได้: ' + (uploadResponse.message || 'Unknown error'));
                }
            }
        }

        const finalImageUrls = [...productImages, ...uploadedImageUrls];
        const data = {
            name, category, price,
            shopee_url: shopeeLink,
            image_url: finalImageUrls.join(','),
        };
        if (productId) {
            data.id = productId;
        }

        const action = productId ? 'updateProduct' : 'addProduct';
        const response = await sendData(action, data);

        if (response.success) {
            showCustomAlert(`สินค้าถูก${productId ? 'อัปเดต' : 'เพิ่ม'}เรียบร้อยแล้ว!`, 'success');
            clearProductForm();
            loadAdminProducts();
        } else {
            throw new Error(response.message || 'Unknown error');
        }
    } catch (error) {
        showCustomAlert(`เกิดข้อผิดพลาด: ${error.message}`, 'error');
    } finally {
        hide(adminLoader);
    }
}

function clearProductForm() {
    getEl('product-form').reset();
    getEl('product-id').value = '';
    getEl('imagePreview').innerHTML = '<p class="text-muted m-auto" style="font-size: 0.9rem;">ไม่มีรูปภาพที่เลือก</p>';
    getEl('form-title').textContent = 'เพิ่มสินค้าใหม่';
    selectedFileBase64 = [];
    selectedFileNames = [];
    productImages = [];
}

async function loadAdminProducts() {
    const adminLoader = getEl('loader');
    const adminProductList = getEl('admin-product-list');
    show(adminLoader);
    hide(adminProductList);

    try {
        const response = await sendData('getProducts', {}, 'GET'); // Re-uses public endpoint
        if (response.success && response.data) {
            adminProducts = response.data;
            renderAdminProducts(adminProducts);
        } else {
            throw new Error(response.message || 'Unknown error');
        }
    } catch (error) {
        showCustomAlert('ไม่สามารถโหลดรายการสินค้าได้: ' + error.message, 'error');
    } finally {
        hide(adminLoader);
        show(adminProductList);
    }
}


function renderAdminProducts(products) {
    const adminProductList = getEl('admin-product-list');
    let tableHtml = `
        <table class="table table-hover align-middle">
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
            <tbody>`;

    if (products.length === 0) {
        tableHtml += `<tr><td colspan="7" class="text-center text-muted py-4">ไม่พบสินค้า</td></tr>`;
    } else {
        products.forEach(product => {
            const firstImageUrl = (product.image_url) ? String(product.image_url).split(',')[0].trim() : 'https://placehold.co/50x50/cccccc/333333?text=NoImg';
            const sanitizedName = sanitizeHTML(product.name);
            const sanitizedCategory = sanitizeHTML(product.category);

            tableHtml += `
                <tr data-id="${product.id}">
                    <td>${sanitizeHTML(product.id)}</td>
                    <td><img src="${firstImageUrl}" alt="${sanitizedName}" class="img-thumbnail" style="width: 50px; height: 50px; object-fit: cover;" onerror="this.onerror=null;this.src='https://placehold.co/50x50/cccccc/333333?text=NoImg';"></td>
                    <td>${sanitizedName}</td>
                    <td>${sanitizedCategory}</td>
                    <td>฿${sanitizeHTML(parseFloat(product.price).toFixed(2))}</td>
                    <td>${product.shopee_url ? `<a href="${sanitizeHTML(product.shopee_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-info text-white"><i class="fas fa-external-link-alt"></i></a>` : 'ไม่มี'}</td>
                    <td>
                        <button class="btn btn-warning btn-sm edit-btn" data-id="${product.id}"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-danger btn-sm delete-btn" data-id="${product.id}"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
        });
    }

    tableHtml += `</tbody></table>`;
    adminProductList.innerHTML = tableHtml;

    // Re-attach event listeners after rendering
    adminProductList.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => editProduct(btn.dataset.id)));
    adminProductList.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => confirmDeleteProduct(btn.dataset.id)));
}

function filterAdminProducts() {
    const searchTerm = getEl('admin-search-input').value.toLowerCase().trim();
    if (!searchTerm) {
        renderAdminProducts(adminProducts);
        return;
    }
    const filtered = adminProducts.filter(p =>
        (p.id && String(p.id).toLowerCase().includes(searchTerm)) ||
        (p.name && p.name.toLowerCase().includes(searchTerm))
    );
    renderAdminProducts(filtered);
}

function editProduct(id) {
    // ... (This function remains largely the same, just ensure it clears all image arrays correctly) ...
    const product = adminProducts.find(p => String(p.id) === String(id));
    if (product) {
        getEl('product-id').value = product.id;
        getEl('name').value = product.name;
        getEl('category').value = product.category;
        getEl('price').value = product.price;
        getEl('shopeeLink').value = product.shopee_url || '';
        getEl('form-title').textContent = `แก้ไขสินค้า: ${sanitizeHTML(product.name)}`;
        
        // Clear all image states before loading new ones
        clearProductFormImages();

        if(product.image_url) {
            productImages = String(product.image_url).split(',').map(url => url.trim()).filter(Boolean);
        }
        renderExistingImagePreviews();

        getEl('product-form').scrollIntoView({ behavior: 'smooth' });
    }
}

async function confirmDeleteProduct(id) {
    const productName = (adminProducts.find(p => String(p.id) === String(id)) || {}).name || id;
    const confirmed = await showCustomAlert(`คุณแน่ใจหรือไม่ที่ต้องการลบสินค้า "${sanitizeHTML(productName)}"?`, 'error', true);
    if (confirmed) {
        deleteProduct(id);
    }
}

async function deleteProduct(id) {
    const adminLoader = getEl('loader');
    show(adminLoader);
    try {
        const response = await sendData('deleteProduct', { id });
        if (response.success) {
            showCustomAlert('สินค้าถูกลบเรียบร้อยแล้ว!', 'success');
            loadAdminProducts();
        } else {
            throw new Error(response.message || 'Unknown error');
        }
    } catch (error) {
        showCustomAlert('เกิดข้อผิดพลาดในการลบสินค้า: ' + error.message, 'error');
    } finally {
        hide(adminLoader);
    }
}


// ---- Image Preview Handling ----
function setupAdminEventListeners() {
    const loginBtn = getEl('login-btn');
    const passwordInput = getEl('password-input');
    const logoutBtn = getEl('logout-btn');
    const productForm = getEl('product-form');
    const clearBtn = getEl('clear-btn');
    const adminSearchInput = getEl('admin-search-input');
    const imageFileInput = getEl('imageFileInput');

    if(loginBtn) loginBtn.addEventListener('click', handleLogin);
    if(passwordInput) passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
    if(logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if(productForm) productForm.addEventListener('submit', handleProductFormSubmit);
    if(clearBtn) clearBtn.addEventListener('click', clearProductForm);
    if(adminSearchInput) adminSearchInput.addEventListener('input', filterAdminProducts);
    if(imageFileInput) imageFileInput.addEventListener('change', handleFileSelect);
}

function clearProductFormImages() {
    getEl('imageFileInput').value = '';
    getEl('imagePreview').innerHTML = '<p class="text-muted m-auto" style="font-size: 0.9rem;">ไม่มีรูปภาพที่เลือก</p>';
    selectedFileBase64 = [];
    selectedFileNames = [];
    productImages = [];
}

async function handleFileSelect(event) {
    const files = event.target.files;
    if (files.length === 0) return;

    // When new files are selected, clear previous selections
    selectedFileBase64 = [];
    selectedFileNames = [];

    for (const file of files) {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                selectedFileBase64.push(e.target.result.split(',')[1]);
                selectedFileNames.push(file.name);
                renderAllImagePreviews();
            };
            reader.readAsDataURL(file);
        }
    }
}

function renderAllImagePreviews() {
    const previewContainer = getEl('imagePreview');
    previewContainer.innerHTML = '';

    if (productImages.length === 0 && selectedFileBase64.length === 0) {
        previewContainer.innerHTML = '<p class="text-muted m-auto" style="font-size: 0.9rem;">ไม่มีรูปภาพที่เลือก</p>';
        return;
    }

    // Render existing images
    productImages.forEach((url, index) => {
        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'img-preview-wrapper';
        imgWrapper.innerHTML = `
            <img src="${url}" class="img-preview" alt="Existing Image">
            <button type="button" class="remove-img-btn" data-type="existing" data-index="${index}">&times;</button>`;
        previewContainer.appendChild(imgWrapper);
    });

    // Render newly selected images
    selectedFileBase64.forEach((b64, index) => {
        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'img-preview-wrapper';
        imgWrapper.innerHTML = `
            <img src="data:image/jpeg;base64,${b64}" class="img-preview" alt="New Image">
            <button type="button" class="remove-img-btn" data-type="new" data-index="${index}">&times;</button>`;
        previewContainer.appendChild(imgWrapper);
    });

    // Add event listeners to remove buttons
    previewContainer.querySelectorAll('.remove-img-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const index = parseInt(btn.dataset.index, 10);
            if (type === 'existing') {
                productImages.splice(index, 1);
            } else if (type === 'new') {
                selectedFileBase64.splice(index, 1);
                selectedFileNames.splice(index, 1);
            }
            renderAllImagePreviews();
        });
    });
}
function renderExistingImagePreviews() { renderAllImagePreviews(); } // Alias for consistency


// ---- Main DOMContentLoaded Event ----
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    const backToTopButton = getEl('back-to-top');

    if (!path.includes('admin.html')) {
        // Public page logic
        loadProducts();
        fetchAndRenderCategories();
        const searchInput = getEl('search-input');
        if (searchInput) searchInput.addEventListener('input', (e) => {
            currentSearchTerm = e.target.value.trim();
            filterAndSearchProducts();
        });
        const categorySelect = getEl('category-select');
        if (categorySelect) categorySelect.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            filterAndSearchProducts();
        });
    } else {
        // Admin page logic
        initAdminPage();
    }
    
    // Back to top button logic for both pages
    if (backToTopButton) {
        window.addEventListener('scroll', () => {
            (window.scrollY > 300) ? show(backToTopButton) : hide(backToTopButton);
        });
        backToTopButton.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
});
