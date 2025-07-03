// ==========================================================
// =================== CONFIGURATION ========================
// ==========================================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwjGn_mnY58mqVmSILLswFu5ZyvaB1x56dzTnY-JbWKIdilOVJMXK6rFjPIF9Zfcspq/exec'; // !!! แทนที่ด้วย URL ของคุณ !!!

// ==========================================================
// =================== GLOBAL STATE =========================
// ==========================================================
let allProducts = [];
let currentUser = { username: '', role: '' };
// State for the product form's image uploader
let existingImageUrls = []; // URLs from the product being edited
let newImageFiles = []; // New files selected by the user { file, base64 }

// ==========================================================
// =================== DOM UTILITIES ========================
// ==========================================================
const getEl = (id) => document.getElementById(id);
const show = (el) => el && el.classList.remove('d-none');
const hide = (el) => el && el.classList.add('d-none');

// ==========================================================
// =================== INITIALIZATION =======================
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path.includes('admin.html')) {
        initAdminPage();
    } else {
        initPublicPage();
    }
    initScrollWidgets();
    initGlobalEventListeners();
});

function initPublicPage() {
    loadProducts();
    fetchAndRenderCategories();
    getEl('search-input')?.addEventListener('input', (e) => filterAndSearchProducts(e.target.value));
    getEl('category-select')?.addEventListener('change', (e) => filterAndSearchProducts(null, e.target.value));
}

function initAdminPage() {
    checkLoginStatus();
    setupAdminEventListeners();
    setupTooltips();
}

function initScrollWidgets() {
    const backToTopButton = getEl('back-to-top');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            backToTopButton?.classList.add('show');
        } else {
            backToTopButton?.classList.remove('show');
        }
    });
}

function initGlobalEventListeners() {
    document.body.addEventListener('click', function(event) {
        if (event.target.classList.contains('toggle-password')) {
            togglePasswordVisibility(event.target);
        }
    });
}

function setupTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

// ==========================================================
// =================== API & DATA HANDLING ==================
// ==========================================================
async function sendData(action, data = {}) {
    try {
        const body = { action, token: sessionStorage.getItem('sessionToken'), data };
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST', mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        if (result.reauth) {
            showCustomAlert('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
            handleLogout();
        }
        return result;
    } catch (error) {
        console.error("API Error:", error);
        showCustomAlert('เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + error.message, 'error');
        return { success: false, message: error.message };
    }
}

// ==========================================================
// =================== PUBLIC PAGE LOGIC ====================
// ==========================================================
async function loadProducts() {
    const loader = getEl('loader');
    show(loader);
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getProducts`);
        const result = await response.json();
        if (result.success) {
            allProducts = result.data;
            renderProducts(allProducts);
        }
    } catch (error) { console.error("Error loading products:", error); } 
    finally { hide(loader); }
}

function renderProducts(products) {
    const container = getEl('product-list-container');
    const noProductsEl = getEl('no-products-found');
    if (!container) return;
    container.innerHTML = '';
    if (products.length === 0) { show(noProductsEl); return; }
    hide(noProductsEl);
    products.forEach(product => {
        const imageUrls = String(product.image_url || '').split(',');
        const firstImageUrl = imageUrls[0]?.trim() || 'https://placehold.co/400x250/cccccc/333333?text=No+Image';
        container.insertAdjacentHTML('beforeend', `
            <div class="col animate__animated animate__fadeInUp">
                <div class="product-card">
                    <img src="${firstImageUrl}" class="card-img-top" alt="${product.name}" onerror="this.src='https://placehold.co/400x250/cccccc/333333?text=Error';">
                    <div class="card-body">
                        <h5 class="card-title">${product.name}</h5>
                        <p class="price">฿${parseFloat(product.price).toFixed(2)}</p>
                        ${product.shopee_url ? `<a href="${product.shopee_url}" target="_blank" class="btn btn-add-to-cart w-100"><i class="fas fa-shopping-cart me-2"></i>สั่งซื้อที่ Shopee</a>` : ''}
                    </div>
                </div>
            </div>`);
    });
}

function filterAndSearchProducts(searchTerm = null, category = null) {
    const currentSearch = searchTerm !== null ? searchTerm : getEl('search-input').value;
    const currentCategory = category !== null ? category : getEl('category-select').value;
    let filtered = allProducts;
    if (currentCategory !== 'ทั้งหมด') {
        filtered = filtered.filter(p => p.category === currentCategory);
    }
    if (currentSearch) {
        const lowerSearch = currentSearch.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(lowerSearch) || p.id.toLowerCase().includes(lowerSearch));
    }
    renderProducts(filtered);
}

async function fetchAndRenderCategories() {
    const select = getEl('category-select');
    if (!select) return;
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getCategories`);
        const result = await response.json();
        if (result.success) {
            result.categories.forEach(cat => select.insertAdjacentHTML('beforeend', `<option value="${cat}">${cat}</option>`));
        }
    } catch (error) { console.error("Error fetching categories:", error); }
}

// ==========================================================
// =================== ADMIN: AUTH & SETUP ==================
// ==========================================================
function checkLoginStatus() {
    const token = sessionStorage.getItem('sessionToken');
    const user = JSON.parse(sessionStorage.getItem('currentUser'));
    if (token && user) {
        currentUser = user;
        show(getEl('admin-panel'));
        hide(getEl('login-gate'));
        show(getEl('user-dropdown'));
        getEl('username-display').textContent = currentUser.username;
        if (currentUser.role === 'SUPERADMIN') {
            show(getEl('user-management-nav-tab'));
        }
        loadAdminData();
    } else {
        hide(getEl('admin-panel'));
        show(getEl('login-gate'));
        hide(getEl('user-dropdown'));
    }
}

async function handleLogin() {
    const username = getEl('username-input').value.trim();
    const password = getEl('password-input').value.trim();
    if (!username || !password) return showCustomAlert('กรุณากรอก Username และ Password', 'error');
    show(getEl('loader'));
    try {
        const result = await sendData('secureLogin', { username, password });
        if (result.success) {
            sessionStorage.setItem('sessionToken', result.token);
            sessionStorage.setItem('currentUser', JSON.stringify(result.user));
            checkLoginStatus();
        } else {
            showCustomAlert(result.message || 'Login failed', 'error');
        }
    } finally { hide(getEl('loader')); }
}

function handleLogout() {
    sessionStorage.clear();
    currentUser = { username: '', role: '' };
    checkLoginStatus();
    showCustomAlert('ออกจากระบบแล้ว', 'info');
}

function setupAdminEventListeners() {
    getEl('secure-login-btn')?.addEventListener('click', handleLogin);
    getEl('password-input')?.addEventListener('keypress', (e) => e.key === 'Enter' && handleLogin());
    getEl('logout-btn')?.addEventListener('click', handleLogout);
    getEl('product-form')?.addEventListener('submit', handleProductFormSubmit);
    getEl('clear-product-form-btn')?.addEventListener('click', clearProductForm);
    getEl('admin-search-input')?.addEventListener('input', (e) => renderAdminProducts(allProducts, e.target.value));
    getEl('imageFileInput')?.addEventListener('change', handleImageFileChange);
    getEl('submit-change-password-btn')?.addEventListener('click', handleChangePassword);
}

// ==========================================================
// =================== ADMIN: DATA & RENDERING ==============
// ==========================================================
async function loadAdminData() {
    const checkTokenResult = await sendData('secureGetUsers');
    if (!checkTokenResult.success) return;

    const productResult = await fetch(`${APPS_SCRIPT_URL}?action=getProducts`);
    const products = await productResult.json();
    if (products.success) {
        allProducts = products.data;
        renderAdminProducts(allProducts);
        renderDashboardStats();
    }
}

function renderDashboardStats() {
    const container = getEl('dashboard-stats');
    if (!container) return;
    const categoryCount = new Set(allProducts.map(p => p.category)).size;

    container.innerHTML = `
        <div class="col-md-6 col-lg-4">
            <div class="dashboard-stat-card animate__animated animate__fadeInUp">
                <div class="stat-icon icon-products"><i class="fas fa-box-seam"></i></div>
                <div class="stat-info"><h6>สินค้าทั้งหมด</h6><div class="stat-number">${allProducts.length}</div></div>
            </div>
        </div>
        <div class="col-md-6 col-lg-4">
            <div class="dashboard-stat-card animate__animated animate__fadeInUp" style="animation-delay: 0.1s;">
                <div class="stat-icon icon-categories"><i class="fas fa-tags"></i></div>
                <div class="stat-info"><h6>หมวดหมู่</h6><div class="stat-number">${categoryCount}</div></div>
            </div>
        </div>
        <div class="col-md-6 col-lg-4">
            <div class="dashboard-stat-card animate__animated animate__fadeInUp" style="animation-delay: 0.2s;">
                <div class="stat-icon icon-user"><i class="fas fa-user-shield"></i></div>
                <div class="stat-info"><h6>ผู้ใช้ปัจจุบัน</h6><div class="stat-number" style="font-size: 1.5rem;">${currentUser.username}</div></div>
            </div>
        </div>
    `;
}

function renderAdminProducts(products, searchTerm = '') {
    const container = getEl('admin-product-list');
    if (!container) return;
    let filtered = products;
    if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        filtered = products.filter(p => p.name.toLowerCase().includes(lowerSearch) || p.id.toLowerCase().includes(lowerSearch));
    }
    container.innerHTML = `
        <table class="table">
            <thead><tr><th>รูป</th><th>ID</th><th>ชื่อสินค้า</th><th>ราคา</th><th class="text-end">การกระทำ</th></tr></thead>
            <tbody>
                ${filtered.map(p => {
                    const firstImg = (p.image_url || '').split(',')[0]?.trim() || 'https://placehold.co/60x60/cccccc/333333?text=N/A';
                    return `
                        <tr>
                            <td><img src="${firstImg}" class="table-img"></td>
                            <td><small class="text-muted">${p.id}</small></td>
                            <td><strong>${p.name}</strong><br><small class="text-muted">${p.category}</small></td>
                            <td>฿${parseFloat(p.price).toFixed(2)}</td>
                            <td class="text-end">
                                <button class="btn btn-warning btn-sm" onclick="editProduct('${p.id}')" data-bs-toggle="tooltip" title="แก้ไข"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')" data-bs-toggle="tooltip" title="ลบ"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>`;
                }).join('') || '<tr><td colspan="5" class="text-center py-4">ไม่พบสินค้า</td></tr>'}
            </tbody>
        </table>`;
    setupTooltips();
}

// ==========================================================
// =================== ADMIN: PRODUCT FORM LOGIC ============
// ==========================================================
async function handleProductFormSubmit(e) {
    e.preventDefault();
    const id = getEl('product-id').value;
    const action = id ? 'secureUpdateProduct' : 'secureAddProduct';
    let data = {
        id,
        name: getEl('name').value,
        category: getEl('category').value,
        price: getEl('price').value,
        shopee_url: getEl('shopeeLink').value,
    };
    if (!data.name || !data.category || !data.price) {
        return showCustomAlert('กรุณากรอกข้อมูลสินค้าให้ครบถ้วน', 'error');
    }
    
    show(getEl('loader'));
    try {
        const uploadedImageUrls = [];
        if (newImageFiles.length > 0) {
            for (const imgFile of newImageFiles) {
                const uploadResult = await sendData('secureUploadImage', {
                    imageData: imgFile.base64,
                    fileName: imgFile.file.name,
                    mimeType: imgFile.file.type
                });
                if (uploadResult.success) uploadedImageUrls.push(uploadResult.url);
            }
        }
        data.image_url = [...existingImageUrls, ...uploadedImageUrls].join(',');

        const result = await sendData(action, data);
        if (result.success) {
            showCustomAlert(`บันทึกสินค้าเรียบร้อย`, 'success');
            clearProductForm();
            loadAdminData();
        } else {
            showCustomAlert(result.message, 'error');
        }
    } finally { hide(getEl('loader')); }
}

function clearProductForm() {
    getEl('product-form').reset();
    getEl('product-id').value = '';
    getEl('form-title').innerHTML = '<i class="fas fa-plus-circle me-2"></i>เพิ่มสินค้าใหม่';
    existingImageUrls = [];
    newImageFiles = [];
    renderImagePreviews();
}

function editProduct(id) {
    const product = allProducts.find(p => p.id === id);
    if (!product) return;
    getEl('product-id').value = product.id;
    getEl('name').value = product.name;
    getEl('category').value = product.category;
    getEl('price').value = product.price;
    getEl('shopeeLink').value = product.shopee_url;
    getEl('form-title').innerHTML = `<i class="fas fa-edit me-2"></i>แก้ไขสินค้า: ${product.name}`;
    
    existingImageUrls = String(product.image_url || '').split(',').filter(Boolean);
    newImageFiles = [];
    renderImagePreviews();

    const productTab = new bootstrap.Tab(getEl('products-tab'));
    productTab.show();
    getEl('product-form').scrollIntoView({ behavior: 'smooth' });
}

async function deleteProduct(id) {
    if (!await showCustomAlert('ยืนยันการลบสินค้านี้? การกระทำนี้ไม่สามารถย้อนกลับได้', 'warning', true)) return;
    show(getEl('loader'));
    const result = await sendData('secureDeleteProduct', { id });
    if (result.success) {
        showCustomAlert('ลบสินค้าแล้ว', 'success');
        loadAdminData();
    } else {
        showCustomAlert(result.message, 'error');
    }
    hide(getEl('loader'));
}

// ==========================================================
// =================== ADMIN: IMAGE UPLOADER ================
// ==========================================================
function handleImageFileChange(event) {
    const files = event.target.files;
    if (files.length > 0) {
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                newImageFiles.push({
                    file: file,
                    base64: e.target.result.split(',')[1]
                });
                renderImagePreviews();
            };
            reader.readAsDataURL(file);
        });
    }
    event.target.value = ''; // Reset file input
}

function renderImagePreviews() {
    const container = getEl('imagePreview');
    if (!container) return;
    container.innerHTML = '';

    const allImages = [
        ...existingImageUrls.map(url => ({ type: 'existing', data: url })),
        ...newImageFiles.map(imgFile => ({ type: 'new', data: imgFile }))
    ];

    allImages.forEach((image, index) => {
        const isCover = index === 0;
        const src = image.type === 'existing' ? image.data : `data:${image.data.file.type};base64,${image.data.base64}`;
        const info = image.type === 'new' ? `${image.data.file.name} (${(image.data.file.size / 1024).toFixed(1)} KB)` : 'รูปเดิม';

        const wrapper = document.createElement('div');
        wrapper.className = `img-preview-wrapper ${isCover ? 'is-cover' : ''}`;
        wrapper.innerHTML = `
            <img src="${src}" class="img-thumbnail" alt="Preview">
            <div class="img-info" data-bs-toggle="tooltip" title="${info}">${info}</div>
            <div class="img-preview-actions">
                <button type="button" class="img-action-btn cover-photo-toggle" data-index="${index}" data-bs-toggle="tooltip" title="ตั้งเป็นภาพปก">
                    <i class="fas fa-star"></i>
                </button>
                <button type="button" class="img-action-btn remove-img-btn" data-index="${index}" data-bs-toggle="tooltip" title="ลบรูปนี้">
                    <i class="fas fa-trash-can"></i>
                </button>
            </div>
        `;
        container.appendChild(wrapper);
    });

    container.querySelectorAll('.remove-img-btn').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(e.currentTarget.dataset.index);
        removeImage(index);
    }));

    container.querySelectorAll('.cover-photo-toggle').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(e.currentTarget.dataset.index);
        setAsCover(index);
    }));

    setupTooltips();
}

function removeImage(index) {
    const existingCount = existingImageUrls.length;
    if (index < existingCount) {
        existingImageUrls.splice(index, 1);
    } else {
        newImageFiles.splice(index - existingCount, 1);
    }
    renderImagePreviews();
}

function setAsCover(index) {
    const existingCount = existingImageUrls.length;
    if (index < existingCount) {
        const [item] = existingImageUrls.splice(index, 1);
        existingImageUrls.unshift(item);
    } else {
        const newIndex = index - existingCount;
        const [item] = newImageFiles.splice(newIndex, 1);
        newImageFiles.unshift(item);
    }
    renderImagePreviews();
}

// ==========================================================
// =================== ADMIN: UTILITIES =====================
// ==========================================================
async function handleChangePassword() {
    const currentPassword = getEl('current-password').value;
    const newPassword = getEl('new-password-modal').value;
    const confirmPassword = getEl('confirm-password-modal').value;
    if (!currentPassword || !newPassword || !confirmPassword) return showCustomAlert('กรุณากรอกข้อมูลให้ครบทุกช่อง', 'error');
    if (newPassword !== confirmPassword) return showCustomAlert('รหัสผ่านใหม่ไม่ตรงกัน', 'error');

    show(getEl('loader'));
    const result = await sendData('secureUpdateOwnPassword', {
        username: currentUser.username, currentPassword, newPassword,
    });
    hide(getEl('loader'));

    if (result.success) {
        const modal = bootstrap.Modal.getInstance(getEl('changePasswordModal'));
        modal.hide();
        showCustomAlert('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
    } else {
        showCustomAlert(result.message, 'error');
    }
}

function togglePasswordVisibility(icon) {
    const passwordInput = icon.previousElementSibling;
    if (passwordInput && passwordInput.tagName === 'INPUT') {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    }
}

// ==========================================================
// =================== CUSTOM ALERTS (MODAL/TOAST) ==========
// ==========================================================
function showCustomAlert(message, type = 'info', isConfirm = false) {
    if (isConfirm) {
        return new Promise((resolve) => {
            const overlay = getEl('custom-modal-overlay');
            overlay.className = 'custom-modal-overlay';
            const typeClass = { success: 'success', error: 'error', warning: 'warning' }[type] || 'info';
            const iconClass = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle' }[type] || 'fa-info-circle';
            overlay.innerHTML = `
                <div class="custom-modal-content animate__animated animate__fadeInDown">
                    <div class="custom-modal-header ${typeClass}"><h5 class="custom-modal-title"><i class="fas ${iconClass} me-2"></i>โปรดยืนยัน</h5><button class="custom-modal-close" data-action="cancel">&times;</button></div>
                    <div class="custom-modal-body"><p>${message}</p></div>
                    <div class="custom-modal-footer"><button class="btn btn-secondary" data-action="cancel">ยกเลิก</button><button class="btn btn-primary" data-action="ok">ตกลง</button></div>
                </div>`;
            const closeModal = (result) => {
                overlay.querySelector('.custom-modal-content').classList.replace('animate__fadeInDown', 'animate__fadeOutUp');
                overlay.querySelector('.custom-modal-content').addEventListener('animationend', () => {
                    overlay.classList.add('d-none');
                    resolve(result);
                }, { once: true });
            };
            overlay.querySelector('[data-action="ok"]').addEventListener('click', () => closeModal(true));
            overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => closeModal(false));
            overlay.querySelector('.custom-modal-close').addEventListener('click', () => closeModal(false));
        });
    }
    let container = getEl('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toastId = 'toast-' + Date.now();
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast-notification ${type}`;
    const iconClass = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' }[type];
    toast.innerHTML = `<div class="toast-icon"><i class="fas ${iconClass}"></i></div><div class="toast-content"><p>${message}</p></div><button class="toast-close-btn">&times;</button>`;
    container.appendChild(toast);
    const closeToast = () => {
        const el = getEl(toastId);
        if (el) {
            el.classList.add('hiding');
            el.addEventListener('transitionend', () => el.remove(), { once: true });
        }
    };
    toast.querySelector('.toast-close-btn').addEventListener('click', closeToast);
    setTimeout(closeToast, 5000);
    return Promise.resolve(true);
}
