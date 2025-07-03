// ==========================================================
// =================== CONFIGURATION ========================
// ==========================================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwjGn_mnY58mqVmSILLswFu5ZyvaB1x56dzTnY-JbWKIdilOVJMXK6rFjPIF9Zfcspq/exec'; // !!! แทนที่ด้วย URL ของคุณ !!!

// ==========================================================
// =================== GLOBAL VARIABLES =====================
// ==========================================================
let allProducts = [];
let currentUser = { username: '', role: '' };
let selectedFileBase64 = null; // For new image upload
let selectedFileName = null;   // For new image upload
let existingImageUrl = null;   // For image that comes with the product on edit

// ==========================================================
// =================== DOM ELEMENT GETTERS ==================
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
}

function initScrollWidgets() {
    const backToTopButton = getEl('back-to-top');
    const doraemonSticker = getEl('doraemon-sticker');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            backToTopButton?.classList.add('show');
            doraemonSticker?.classList.add('show');
        } else {
            backToTopButton?.classList.remove('show');
            doraemonSticker?.classList.remove('show');
        }
    });
}

function initGlobalEventListeners() {
    document.body.addEventListener('click', function(event) {
        const toggleBtn = event.target.closest('.toggle-password-btn');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            const inputGroup = toggleBtn.closest('.input-group');
            const passwordInput = inputGroup.querySelector('input[type="password"], input[type="text"]');

            if (passwordInput && icon) {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                
                icon.classList.toggle('fa-eye');
                icon.classList.toggle('fa-eye-slash');
            }
        }
    });
}

// ==========================================================
// =================== API & DATA HANDLING ==================
// ==========================================================
async function sendData(action, data = {}) {
    try {
        const body = {
            action: action,
            token: sessionStorage.getItem('sessionToken'),
            data: data
        };
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
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
    } catch (error) {
        console.error("Error loading products:", error);
    } finally {
        hide(loader);
    }
}

function renderProducts(products) {
    const container = getEl('product-list-container');
    const noProductsEl = getEl('no-products-found');
    if (!container) return;
    container.innerHTML = '';
    
    if (products.length === 0) {
        show(noProductsEl);
        return;
    }
    hide(noProductsEl);

    products.forEach(product => {
        const imageUrls = String(product.image_url || '').split(',');
        const firstImageUrl = imageUrls[0]?.trim() || 'https://placehold.co/400x250/cccccc/333333?text=No+Image';
        const cardHtml = `
            <div class="col animate__animated animate__fadeInUp">
                <div class="product-card">
                    <img src="${firstImageUrl}" class="card-img-top" alt="${product.name}" onerror="this.src='https://placehold.co/400x250/cccccc/333333?text=Error';">
                    <div class="card-body">
                        <h5 class="card-title">${product.name}</h5>
                        <p class="price">฿${parseFloat(product.price).toFixed(2)}</p>
                        ${product.shopee_url ? `<a href="${product.shopee_url}" target="_blank" class="btn btn-add-to-cart w-100"><i class="fas fa-shopping-cart me-2"></i>สั่งซื้อที่ Shopee</a>` : ''}
                    </div>
                </div>
            </div>`;
        container.insertAdjacentHTML('beforeend', cardHtml);
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
        filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(lowerSearch) ||
            p.id.toLowerCase().includes(lowerSearch)
        );
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
            result.categories.forEach(cat => {
                select.insertAdjacentHTML('beforeend', `<option value="${cat}">${cat}</option>`);
            });
        }
    } catch (error) {
        console.error("Error fetching categories:", error);
    }
}

// ==========================================================
// =================== ADMIN: AUTHENTICATION ================
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
        loadAdminProducts();
    } else {
        hide(getEl('admin-panel'));
        show(getEl('login-gate'));
        hide(getEl('user-dropdown'));
    }
}

async function handleLogin() {
    const username = getEl('username-input').value.trim();
    const password = getEl('password-input').value.trim();
    if (!username || !password) {
        return showCustomAlert('กรุณากรอก Username และ Password', 'error');
    }
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
    } finally {
        hide(getEl('loader'));
    }
}

function handleLogout() {
    sessionStorage.clear();
    currentUser = { username: '', role: '' };
    window.location.reload();
}

// ==========================================================
// =================== ADMIN: EVENT LISTENERS ===============
// ==========================================================
function setupAdminEventListeners() {
    getEl('secure-login-btn')?.addEventListener('click', handleLogin);
    getEl('password-input')?.addEventListener('keypress', (e) => e.key === 'Enter' && handleLogin());
    getEl('logout-btn')?.addEventListener('click', handleLogout);

    // Product Form
    getEl('product-form')?.addEventListener('submit', handleProductFormSubmit);
    getEl('clear-product-form-btn')?.addEventListener('click', clearProductForm);
    getEl('admin-search-input')?.addEventListener('input', (e) => renderAdminProducts(allProducts, e.target.value));
    
    // Image Uploader Events
    const dropzone = getEl('image-dropzone');
    if (dropzone) {
        dropzone.addEventListener('dragenter', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
        dropzone.addEventListener('dragleave', (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            handleImageFileChange({ target: { files: e.dataTransfer.files } });
        });
        getEl('imageFileInput')?.addEventListener('change', handleImageFileChange);
    }

    // Change Password Modal
    getEl('submit-change-password-btn')?.addEventListener('click', handleChangePassword);
}

// ==========================================================
// =================== ADMIN: DASHBOARD (NEW) ===============
// ==========================================================
function updateDashboardStats() {
    if (!getEl('stat-total-products')) return; // Exit if not on admin page
    // Total Products
    getEl('stat-total-products').textContent = allProducts.length;

    // Total Categories
    const categories = new Set(allProducts.map(p => p.category).filter(Boolean));
    getEl('stat-total-categories').textContent = categories.size;

    // Current User
    getEl('stat-current-user').textContent = currentUser.username;
}


// ==========================================================
// =================== ADMIN: PRODUCT MGMT ==================
// ==========================================================
async function loadAdminProducts() {
    const checkTokenResult = await sendData('secureGetUsers'); // Simple token validation call
    if (checkTokenResult.success) { 
        const productResult = await fetch(`${APPS_SCRIPT_URL}?action=getProducts`);
        const products = await productResult.json();
        if (products.success) {
            allProducts = products.data;
            renderAdminProducts(allProducts);
            updateDashboardStats(); // Update dashboard after products are loaded
        }
    }
}

function renderAdminProducts(products, searchTerm = '') {
    const container = getEl('admin-product-list');
    if(!container) return;

    let filteredProducts = products;
    if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        filteredProducts = products.filter(p => 
            p.name.toLowerCase().includes(lowerSearch) || 
            String(p.id).toLowerCase().includes(lowerSearch)
        );
    }

    const tableHtml = `
        <table class="admin-table">
            <thead><tr><th>รูป</th><th>ชื่อสินค้า</th><th>ราคา</th><th class="text-end">การกระทำ</th></tr></thead>
            <tbody>
                ${filteredProducts.map(p => {
                    const imageUrls = String(p.image_url || '').split(',');
                    const firstImg = imageUrls[0]?.trim() || 'https://placehold.co/50x50/cccccc/333333?text=NoImg';
                    return `
                        <tr>
                            <td><img src="${firstImg}" class="img-thumbnail" style="width:50px; height:50px; object-fit:cover; border-radius: 8px;"></td>
                            <td>
                                <div class="product-name">${p.name}</div>
                                <small class="text-muted">ID: ${p.id}</small>
                            </td>
                            <td class="product-price">฿${parseFloat(p.price).toFixed(2)}</td>
                            <td class="text-end">
                                <div class="action-btns">
                                    <button class="btn-action edit" onclick="editProduct('${p.id}')" title="แก้ไข"><i class="fas fa-edit"></i></button>
                                    <button class="btn-action delete" onclick="deleteProduct('${p.id}')" title="ลบ"><i class="fas fa-trash"></i></button>
                                </div>
                            </td>
                        </tr>`;
                }).join('') || '<tr><td colspan="4" class="text-center p-4">ไม่พบสินค้า</td></tr>'}
            </tbody>
        </table>`;
    container.innerHTML = tableHtml;
}

async function handleProductFormSubmit(e) {
    e.preventDefault();
    const id = getEl('product-id').value;
    const action = id ? 'secureUpdateProduct' : 'secureAddProduct';
    
    let data = {
        id: id,
        name: getEl('name').value,
        category: getEl('category').value,
        price: getEl('price').value,
        shopee_url: getEl('shopeeLink').value,
    };

    if (!data.name || !data.category || !data.price) {
        return showCustomAlert('กรุณากรอกข้อมูลสินค้าให้ครบ', 'error');
    }
    
    show(getEl('loader'));
    try {
        let finalImageUrl = existingImageUrl || '';

        if (selectedFileBase64 && selectedFileName) {
            const uploadResult = await sendData('secureUploadImage', {
                imageData: selectedFileBase64,
                fileName: selectedFileName,
                mimeType: `image/${selectedFileName.split('.').pop()}`
            });
            if (uploadResult.success) {
                finalImageUrl = uploadResult.url;
            } else {
                showCustomAlert(`เกิดข้อผิดพลาดในการอัปโหลดรูป`, 'error');
                hide(getEl('loader'));
                return;
            }
        }
        data.image_url = finalImageUrl;

        const result = await sendData(action, data);
        if (result.success) {
            showCustomAlert(`บันทึกสินค้าเรียบร้อย`, 'success');
            clearProductForm();
            loadAdminProducts();
        } else {
            showCustomAlert(result.message, 'error');
        }
    } finally {
        hide(getEl('loader'));
    }
}

function clearProductForm() {
    getEl('product-form').reset();
    getEl('product-id').value = '';
    getEl('form-title').textContent = 'เพิ่มสินค้าใหม่';
    getEl('save-btn-text').textContent = 'บันทึก';
    clearImageState();
}

function editProduct(id) {
    const product = allProducts.find(p => p.id == id); // Use == for potential type difference
    if (!product) return;
    
    clearProductForm(); // Clear form completely before populating

    getEl('product-id').value = product.id;
    getEl('name').value = product.name;
    getEl('category').value = product.category;
    getEl('price').value = product.price;
    getEl('shopeeLink').value = product.shopee_url || '';
    getEl('form-title').textContent = `แก้ไขสินค้า`;
    getEl('save-btn-text').textContent = 'บันทึกการแก้ไข';
    
    // BUG FIX: Correctly assign existing image URL
    existingImageUrl = (String(product.image_url || '').split(',')[0]) || null;
    
    renderImagePreviews();

    getEl('product-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteProduct(id) {
    if (!await showCustomAlert('ยืนยันการลบสินค้านี้?', 'warning', true)) return;
    show(getEl('loader'));
    const result = await sendData('secureDeleteProduct', { id });
    if (result.success) {
        showCustomAlert('ลบสินค้าแล้ว', 'success');
        loadAdminProducts();
    } else {
        showCustomAlert(result.message, 'error');
    }
    hide(getEl('loader'));
}


// --- REVAMPED IMAGE UPLOADER FUNCTIONS (SINGLE FILE) ---
function handleImageFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    clearImageState(); // Clear previous state to ensure only one image is handled

    const reader = new FileReader();
    reader.onload = (e) => {
        selectedFileBase64 = e.target.result.split(',')[1];
        selectedFileName = file.name;
        renderImagePreviews();
    };
    reader.readAsDataURL(file);
    
    event.target.value = '';
}

function clearImageState() {
    selectedFileBase64 = null;
    selectedFileName = null;
    existingImageUrl = null;
    renderImagePreviews(); // Re-render to show the empty state
}

function renderImagePreviews() {
    const container = getEl('imagePreview');
    const dropzone = getEl('image-dropzone');
    if (!container || !dropzone) return;

    container.innerHTML = '';
    let imageToRender = null;
    let imageName = '';

    if (selectedFileBase64) {
        imageToRender = `data:image/jpeg;base64,${selectedFileBase64}`;
        imageName = selectedFileName;
    } else if (existingImageUrl) {
        imageToRender = existingImageUrl;
        imageName = existingImageUrl.split('/').pop().split('?')[0]; // Clean URL for display
    }

    if (imageToRender) {
        dropzone.classList.add('has-files');
        const wrapper = document.createElement('div');
        wrapper.className = 'dz-preview-item';
        wrapper.innerHTML = `
            <img src="${imageToRender}" alt="Preview">
            <div class="file-name" title="${imageName}">${imageName}</div>
            <button type="button" class="dz-remove-btn">&times;</button>
        `;
        container.appendChild(wrapper);

        // BUG FIX: Correctly add event listener to the remove button
        container.querySelector('.dz-remove-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            clearImageState();
        });

    } else {
        dropzone.classList.remove('has-files');
    }
}


// ==========================================================
// =================== ADMIN: PASSWORD MGMT =================
// ==========================================================
async function handleChangePassword() {
    const currentPassword = getEl('current-password').value;
    const newPassword = getEl('new-password-modal').value;
    const confirmPassword = getEl('confirm-password-modal').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        return showCustomAlert('กรุณากรอกข้อมูลให้ครบทุกช่อง', 'error');
    }
    if (newPassword !== confirmPassword) {
        return showCustomAlert('รหัสผ่านใหม่ไม่ตรงกัน', 'error');
    }

    show(getEl('loader'));
    const result = await sendData('secureUpdateOwnPassword', {
        username: currentUser.username,
        currentPassword: currentPassword,
        newPassword: newPassword,
    });
    hide(getEl('loader'));

    if (result.success) {
        const modalEl = getEl('changePasswordModal');
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.hide();
        showCustomAlert('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
    } else {
        showCustomAlert(result.message, 'error');
    }
}

// ==========================================================
// =================== UTILITIES (UPGRADED) =================
// ==========================================================
function showCustomAlert(message, type = 'info', isConfirm = false) {
    if (isConfirm) {
        return new Promise((resolve) => {
            let modalOverlay = getEl('custom-modal-overlay');
            if (!modalOverlay) {
                modalOverlay = document.createElement('div');
                modalOverlay.id = 'custom-modal-overlay';
                document.body.appendChild(modalOverlay);
            }
            modalOverlay.className = 'custom-modal-overlay';

            const typeClass = { success: 'success', error: 'error', warning: 'warning' }[type] || 'info';
            const iconClass = { success: 'fas fa-check-circle', error: 'fas fa-times-circle', warning: 'fas fa-exclamation-triangle' }[type] || 'fas fa-info-circle';
            
            modalOverlay.innerHTML = `
                <div class="custom-modal-content animate__animated animate__fadeInDown">
                    <div class="custom-modal-header ${typeClass}">
                        <h5 class="custom-modal-title"><i class="${iconClass} me-2"></i>โปรดยืนยัน</h5>
                        <button type="button" class="custom-modal-close" data-action="cancel">&times;</button>
                    </div>
                    <div class="custom-modal-body"><p>${message}</p></div>
                    <div class="custom-modal-footer">
                        <button class="btn btn-secondary" data-action="cancel">ยกเลิก</button>
                        <button class="btn btn-primary" data-action="ok">ตกลง</button>
                    </div>
                </div>`;
            
            const closeModal = (result) => {
                const content = modalOverlay.querySelector('.custom-modal-content');
                if (content) {
                    content.classList.replace('animate__fadeInDown', 'animate__fadeOutUp');
                    content.addEventListener('animationend', () => {
                        modalOverlay.classList.add('d-none');
                        resolve(result);
                    }, { once: true });
                } else {
                    modalOverlay.classList.add('d-none');
                    resolve(result);
                }
            };

            modalOverlay.querySelector('[data-action="ok"]').addEventListener('click', () => closeModal(true));
            modalOverlay.querySelector('[data-action="cancel"]').addEventListener('click', () => closeModal(false));
            modalOverlay.querySelector('.custom-modal-close').addEventListener('click', () => closeModal(false));
        });
    }

    let toastContainer = getEl('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    const toastId = 'toast-' + Date.now();
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast-notification ${type}`;

    const iconClass = {
        success: 'fas fa-check-circle',
        error: 'fas fa-times-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    }[type];

    toast.innerHTML = `
        <div class="toast-icon"><i class="${iconClass}"></i></div>
        <div class="toast-content"><p>${message}</p></div>
        <button class="toast-close-btn">&times;</button>
    `;

    toastContainer.appendChild(toast);

    const closeToast = () => {
        const toastEl = getEl(toastId);
        if (toastEl) {
            toastEl.classList.add('hiding');
            toastEl.addEventListener('transitionend', () => {
                toastEl.remove();
                if (getEl('toast-container') && getEl('toast-container').children.length === 0) {
                     getEl('toast-container').remove();
                }
            }, { once: true });
        }
    };

    toast.querySelector('.toast-close-btn').addEventListener('click', closeToast);

    setTimeout(closeToast, 5000);
    return Promise.resolve(true);
}
