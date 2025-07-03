// ==========================================================
// =================== CONFIGURATION ========================
// ==========================================================
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwjGn_mnY58mqVmSILLswFu5ZyvaB1x56dzTnY-JbWKIdilOVJMXK6rFjPIF9Zfcspq/exec'; // !!! แทนที่ด้วย URL ของคุณ !!!

// ==========================================================
// =================== GLOBAL VARIABLES =====================
// ==========================================================
let allProducts = [];
let currentUser = { username: '', role: '' };
let selectedFileBase64 = [];
let selectedFileNames = [];
let productImages = []; // Stores URLs of existing images for the product being edited

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
        // Find the closest toggle button
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
        
        // Handle Superadmin features
        if (currentUser.role === 'SUPERADMIN') {
            show(getEl('user-management-tab'));
            loadAdminUsers();
        } else {
            hide(getEl('user-management-tab'));
        }

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
    window.location.reload(); // Reload to reset state cleanly
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
    
    // REVAMPED Image Uploader Events
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
            p.id.toLowerCase().includes(lowerSearch)
        );
    }

    // REVAMPED Table HTML
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
        let uploadedImageUrls = [];
        if (selectedFileBase64.length > 0) {
            for (let i = 0; i < selectedFileBase64.length; i++) {
                const uploadResult = await sendData('secureUploadImage', {
                    imageData: selectedFileBase64[i],
                    fileName: selectedFileNames[i],
                    mimeType: `image/${selectedFileNames[i].split('.').pop()}`
                });
                if (uploadResult.success) {
                    uploadedImageUrls.push(uploadResult.url);
                } else {
                     showCustomAlert(`เกิดข้อผิดพลาดในการอัปโหลดรูป: ${selectedFileNames[i]}`, 'error');
                }
            }
        }
        // Combine existing (un-deleted) images with newly uploaded ones
        data.image_url = [...productImages, ...uploadedImageUrls].join(',');

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
    productImages = [];
    selectedFileBase64 = [];
    selectedFileNames = [];
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
    getEl('form-title').textContent = `แก้ไขสินค้า`;
    getEl('save-btn-text').textContent = 'บันทึกการแก้ไข';
    
    // Reset and populate image arrays
    productImages = String(product.image_url || '').split(',').filter(Boolean); // Filter out empty strings
    selectedFileBase64 = [];
    selectedFileNames = [];

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


// --- REVAMPED IMAGE UPLOADER FUNCTIONS ---
function handleImageFileChange(event) {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
        // Prevent duplicates
        if (selectedFileNames.includes(file.name)) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            selectedFileBase64.push(e.target.result.split(',')[1]);
            selectedFileNames.push(file.name);
            renderImagePreviews();
        };
        reader.readAsDataURL(file);
    });
    
    // Clear the input value to allow re-selecting the same file
    event.target.value = '';
}

function renderImagePreviews() {
    const container = getEl('imagePreview');
    const dropzone = getEl('image-dropzone');
    if (!container || !dropzone) return;

    container.innerHTML = ''; // Clear existing previews

    // Combine existing and new images for rendering
    const allImages = [
        ...productImages.map(url => ({ type: 'existing', src: url, name: url.split('/').pop() })),
        ...selectedFileBase64.map((b64, i) => ({ type: 'new', src: `data:image/jpeg;base64,${b64}`, name: selectedFileNames[i] }))
    ];

    if (allImages.length === 0) {
        dropzone.classList.remove('has-files');
        return;
    }
    
    dropzone.classList.add('has-files');

    allImages.forEach((img, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'dz-preview-item';
        wrapper.innerHTML = `
            <img src="${img.src}" alt="Preview">
            <div class="file-name" title="${img.name}">${img.name}</div>
            <button type="button" class="dz-remove-btn" data-index="${index}" data-type="${img.type}">&times;</button>
        `;
        container.appendChild(wrapper);
    });

    // Add event listeners to the new remove buttons
    container.querySelectorAll('.dz-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent dropzone click
            const index = parseInt(e.target.dataset.index);
            const type = e.target.dataset.type;

            if (type === 'existing') {
                // Remove from the `productImages` array
                productImages.splice(index, 1);
            } else {
                // Adjust index for the `selectedFile...` arrays
                const newIndex = index - productImages.length;
                selectedFileBase64.splice(newIndex, 1);
                selectedFileNames.splice(newIndex, 1);
            }
            renderImagePreviews(); // Re-render the previews
        });
    });
}


// ==========================================================
// =================== ADMIN: USER & PASSWORD MGMT =========
// ==========================================================
async function loadAdminUsers() {
    // This function would be filled out if user management was fully implemented
    // For now, it's a placeholder to show/hide the tab
}

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
    // --- CONFIRMATION MODAL (For critical actions) ---
    if (isConfirm) {
        return new Promise((resolve) => {
            let modalOverlay = getEl('custom-modal-overlay');
            if (!modalOverlay) {
                modalOverlay = document.createElement('div');
                modalOverlay.id = 'custom-modal-overlay';
                document.body.appendChild(modalOverlay);
            }
            modalOverlay.className = 'custom-modal-overlay'; // Reset classes and show

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

    // --- MODERN TOAST NOTIFICATION (For general feedback) ---
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
