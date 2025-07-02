/**
 * MyShop - Doraemon Theme Application Logic
 * Version: 2.0 (Professional Modular Architecture)
 * Author: Gemini
 * Description: A completely refactored and enhanced script for the Doraemon-themed shop.
 * This version features a modular architecture, advanced animations, improved UI/UX,
 * and robust code structure for better maintainability and scalability.
 * All original functionalities are preserved and enhanced.
 */

// ==========================================================
// =================== MAIN APPLICATION MODULE ==============
// ==========================================================
const App = (() => {

    /**
     * Application State
     * @private
     */
    const _state = {
        allProducts: [],
        filteredProducts: [],
        currentUser: { username: '', role: '' },
        categories: [],
        productImages: [],       // For admin form: existing image URLs
        selectedFileBase64: [],  // For admin form: new images as base64
        selectedFileNames: [],   // For admin form: new image names
    };

    /**
     * Configuration
     * @private
     */
    const _config = {
        scriptURL: 'https://script.google.com/macros/s/AKfycbwjGn_mnY58mqVmSILLswFu5ZyvaB1x56dzTnY-JbWKIdilOVJMXK6rFjPIF9Zfcspq/exec',
        placeholderImage: 'https://placehold.co/400x250/cccccc/333333?text=No+Image',
        placeholderThumb: 'https://placehold.co/50x50/cccccc/333333?text=NoImg'
    };


    // ==========================================================
    // =================== UTILITY MODULE =======================
    // ==========================================================
    const Utils = {
        /**
         * Gets a DOM element by its ID.
         * @param {string} id - The ID of the element.
         * @returns {HTMLElement|null} The DOM element or null if not found.
         */
        getEl: (id) => document.getElementById(id),

        /**
         * Shows a DOM element by removing the 'd-none' class.
         * @param {HTMLElement} el - The element to show.
         */
        show: (el) => el?.classList.remove('d-none'),

        /**
         * Hides a DOM element by adding the 'd-none' class.
         * @param {HTMLElement} el - The element to hide.
         */
        hide: (el) => el?.classList.add('d-none'),

        /**
         * Creates a debounced function that delays invoking `func` until after `wait`
         * milliseconds have elapsed since the last time the debounced function was invoked.
         * @param {Function} func - The function to debounce.
         * @param {number} wait - The number of milliseconds to delay.
         * @returns {Function} The new debounced function.
         */
        debounce: (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }
    };


    // ==========================================================
    // =================== API MODULE ===========================
    // ==========================================================
    const API = {
        /**
         * Fetches data from a URL using GET method.
         * @param {string} url - The URL to fetch from.
         * @returns {Promise<Object>} The JSON response.
         */
        get: async (url) => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.statusText}`);
                }
                return await response.json();
            } catch (error) {
                console.error(`Fetch GET Error for ${url}:`, error);
                UI.Toast.show('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
                throw error; // Re-throw to be handled by the caller
            }
        },

        /**
         * Sends data to the backend using POST method.
         * @param {string} action - The action to be performed on the backend.
         * @param {Object} data - The payload to send.
         * @returns {Promise<Object>} The JSON response from the backend.
         */
        post: async (action, data = {}) => {
            try {
                const body = {
                    action: action,
                    token: sessionStorage.getItem('sessionToken'),
                    data: data
                };
                const response = await fetch(_config.scriptURL, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const result = await response.json();
                
                // Handle session expiration globally
                if (result.reauth) {
                    UI.Modal.show('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error').then(Auth.logout);
                }
                return result;
            } catch (error) {
                console.error(`API POST Error for action "${action}":`, error);
                UI.Toast.show('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์', 'error');
                return { success: false, message: error.message };
            }
        }
    };


    // ==========================================================
    // =================== UI MODULE ============================
    // ==========================================================
    const UI = {
        /**
         * Renders product cards on the public page.
         */
        renderPublicProducts: () => {
            const container = Utils.getEl('product-list-container');
            const noProductsEl = Utils.getEl('no-products-found');
            if (!container) return;
            
            container.innerHTML = '';
            
            if (_state.filteredProducts.length === 0) {
                Utils.show(noProductsEl);
                return;
            }
            Utils.hide(noProductsEl);

            _state.filteredProducts.forEach((product, index) => {
                const imageUrls = String(product.image_url || '').split(',');
                const firstImageUrl = imageUrls[0]?.trim() || _config.placeholderImage;
                const card = document.createElement('div');
                card.className = 'col animate__animated animate__fadeInUp';
                card.style.animationDelay = `${index * 50}ms`;
                card.innerHTML = `
                    <div class="product-card">
                        <div class="product-card-img-container">
                             <img src="${firstImageUrl}" class="card-img-top" alt="${product.name}" onerror="this.onerror=null;this.src='${_config.placeholderImage}';">
                        </div>
                        <div class="card-body">
                            <h5 class="card-title">${product.name}</h5>
                            <p class="price">฿${parseFloat(product.price).toFixed(2)}</p>
                            ${product.shopee_url ? `<a href="${product.shopee_url}" target="_blank" class="btn btn-add-to-cart w-100"><i class="fas fa-shopping-cart me-2"></i>สั่งซื้อที่ Shopee</a>` : ''}
                        </div>
                    </div>`;
                container.appendChild(card);
            });
        },

        /**
         * Renders the category filter dropdown.
         */
        renderCategories: () => {
            const select = Utils.getEl('category-select');
            if (!select) return;
            select.innerHTML = '<option value="ทั้งหมด" selected>ทั้งหมด</option>'; // Reset
            _state.categories.forEach(cat => {
                select.insertAdjacentHTML('beforeend', `<option value="${cat}">${cat}</option>`);
            });
        },

        /**
         * Renders the product table in the admin panel.
         * @param {string} [searchTerm=''] - Optional search term to filter products.
         */
        renderAdminProducts: (searchTerm = '') => {
            const container = Utils.getEl('admin-product-list');
            if(!container) return;

            let productsToRender = _state.allProducts;
            if (searchTerm) {
                const lowerSearch = searchTerm.toLowerCase();
                productsToRender = _state.allProducts.filter(p => 
                    p.name.toLowerCase().includes(lowerSearch) || 
                    p.id.toString().toLowerCase().includes(lowerSearch) ||
                    p.category.toLowerCase().includes(lowerSearch)
                );
            }

            const tableHtml = `
                <div class="table-responsive">
                    <table class="table table-hover align-middle">
                        <thead><tr><th>ID</th><th>รูป</th><th>ชื่อสินค้า</th><th>หมวดหมู่</th><th>ราคา</th><th class="text-end">การกระทำ</th></tr></thead>
                        <tbody>
                            ${productsToRender.map(p => {
                                const imageUrls = String(p.image_url || '').split(',');
                                const firstImg = imageUrls[0]?.trim() || _config.placeholderThumb;
                                return `
                                    <tr>
                                        <td><small class="text-muted">${p.id}</small></td>
                                        <td><img src="${firstImg}" class="img-thumbnail" style="width:50px; height:50px; object-fit:cover;" onerror="this.onerror=null;this.src='${_config.placeholderThumb}';"></td>
                                        <td>${p.name}</td>
                                        <td><span class="badge bg-secondary">${p.category}</span></td>
                                        <td>${parseFloat(p.price).toFixed(2)}</td>
                                        <td class="text-end">
                                            <button class="btn btn-warning btn-sm" onclick="App.Admin.editProduct('${p.id}')" title="แก้ไข"><i class="fas fa-edit"></i></button>
                                            <button class="btn btn-danger btn-sm" onclick="App.Admin.deleteProduct('${p.id}')" title="ลบ"><i class="fas fa-trash"></i></button>
                                        </td>
                                    </tr>`;
                            }).join('') || '<tr><td colspan="6" class="text-center py-4">ไม่พบสินค้า</td></tr>'}
                        </tbody>
                    </table>
                </div>`;
            container.innerHTML = tableHtml;
        },

        /**
         * Renders previews of images for the product form.
         */
        renderImagePreviews: () => {
            const container = Utils.getEl('imagePreview');
            if (!container) return;

            container.innerHTML = '';
            const allImageSources = [
                ..._state.productImages,
                ..._state.selectedFileBase64.map(b64 => `data:image/jpeg;base64,${b64}`)
            ];

            if (allImageSources.length === 0) {
                container.innerHTML = '<p class="text-muted m-auto" style="font-size: 0.9rem;">ไม่มีรูปภาพ</p>';
                return;
            }

            allImageSources.forEach((src, index) => {
                const isExisting = index < _state.productImages.length;
                const wrapper = document.createElement('div');
                wrapper.className = 'img-preview-wrapper animate__animated animate__zoomIn';
                wrapper.innerHTML = `
                    <img src="${src}" class="img-thumbnail">
                    <button type="button" class="remove-img-btn" title="ลบรูปนี้">&times;</button>
                `;
                container.appendChild(wrapper);

                wrapper.querySelector('.remove-img-btn').addEventListener('click', () => {
                    Admin.removeImage(index, isExisting);
                });
            });
        },

        /**
         * Manages all fun animations and sticker interactions.
         */
        Animation: {
            init: () => {
                const backToTopButton = Utils.getEl('back-to-top');
                const flyingDoraemon = Utils.getEl('flying-doraemon-sticker');

                // Scroll-based animations
                window.addEventListener('scroll', () => {
                    // Show/hide scroll-dependent elements
                    if (window.scrollY > 300) {
                        Utils.show(backToTopButton);
                        Utils.show(flyingDoraemon);
                    } else {
                        Utils.hide(backToTopButton);
                        Utils.hide(flyingDoraemon);
                    }
                    // Parallax background effect
                    const yPos = -window.scrollY / 5;
                    document.body.style.backgroundPosition = `center ${yPos}px`;
                }, { passive: true });

                // Mouse-move based animations
                document.addEventListener('mousemove', (e) => {
                    if (flyingDoraemon && !flyingDoraemon.classList.contains('d-none')) {
                        const x = (e.clientX - window.innerWidth / 2) / 50;
                        const y = (e.clientY - window.innerHeight / 2) / 50;
                        flyingDoraemon.style.transform = `translate(${x}px, ${y}px)`;
                    }
                }, { passive: true });
            }
        },

        /**
         * Manages toast notifications.
         */
        Toast: {
            container: null,
            init: () => {
                if (!Utils.getEl('toast-container')) {
                    const toastContainer = document.createElement('div');
                    toastContainer.id = 'toast-container';
                    document.body.appendChild(toastContainer);
                    UI.Toast.container = toastContainer;
                }
            },
            show: (message, type = 'info', duration = 4000) => {
                if (!UI.Toast.container) UI.Toast.init();
                
                const icons = {
                    info: 'fa-info-circle',
                    success: 'fa-check-circle',
                    warning: 'fa-exclamation-triangle',
                    error: 'fa-times-circle'
                };

                const toast = document.createElement('div');
                toast.className = `toast-notification toast-${type} animate__animated animate__fadeInRight`;
                
                toast.innerHTML = `
                    <div class="toast-icon"><i class="fas ${icons[type]}"></i></div>
                    <div class="toast-content">
                        <p class="toast-message">${message}</p>
                    </div>
                    <button class="toast-close-btn">&times;</button>
                `;

                UI.Toast.container.appendChild(toast);

                const removeToast = () => {
                    toast.classList.replace('animate__fadeInRight', 'animate__fadeOutRight');
                    toast.addEventListener('animationend', () => toast.remove(), { once: true });
                };

                toast.querySelector('.toast-close-btn').addEventListener('click', removeToast);
                setTimeout(removeToast, duration);
            }
        },

        /**
         * Manages modal dialogs.
         */
        Modal: {
            show: (message, type = 'info', isConfirm = false) => {
                return new Promise((resolve) => {
                    let modalOverlay = Utils.getEl('custom-modal-overlay');
                    if (!modalOverlay) {
                        modalOverlay = document.createElement('div');
                        modalOverlay.id = 'custom-modal-overlay';
                        document.body.appendChild(modalOverlay);
                    }
                    
                    modalOverlay.className = 'modal-overlay show';

                    const icons = {
                        info: 'fa-info-circle',
                        success: 'fa-check-circle',
                        warning: 'fa-exclamation-triangle',
                        error: 'fa-bomb'
                    };

                    const titles = {
                        info: 'แจ้งเตือน',
                        success: 'สำเร็จ!',
                        warning: 'โปรดยืนยัน',
                        error: 'เกิดข้อผิดพลาด'
                    };

                    modalOverlay.innerHTML = `
                        <div class="modal-content">
                            <div class="modal-icon-container modal-${type}">
                                <i class="fas ${icons[type]}"></i>
                            </div>
                            <h4 class="modal-title">${isConfirm ? titles.warning : titles[type]}</h4>
                            <p class="modal-body-text">${message}</p>
                            <div class="modal-footer">
                                ${isConfirm ? `<button class="btn btn-secondary" data-action="cancel">ยกเลิก</button>` : ''}
                                <button class="btn btn-primary" data-action="ok">ตกลง</button>
                            </div>
                        </div>`;
                    
                    const content = modalOverlay.querySelector('.modal-content');
                    // Force a reflow to enable animation
                    content.offsetHeight;
                    content.classList.add('show');

                    const closeModal = (result) => {
                        content.classList.remove('show');
                        content.addEventListener('transitionend', () => {
                            modalOverlay.classList.remove('show');
                            resolve(result);
                        }, { once: true });
                    };

                    modalOverlay.querySelector('[data-action="ok"]').addEventListener('click', () => closeModal(true));
                    if (isConfirm) {
                        modalOverlay.querySelector('[data-action="cancel"]').addEventListener('click', () => closeModal(false));
                    }
                });
            }
        },
        
        /**
         * Toggles the global loader visibility.
         * @param {boolean} visible - Whether to show or hide the loader.
         */
        toggleLoader: (visible) => {
            const loader = Utils.getEl('global-loader');
            if (!loader) return;
            visible ? Utils.show(loader) : Utils.hide(loader);
        }
    };


    // ==========================================================
    // =================== AUTH MODULE ==========================
    // ==========================================================
    const Auth = {
        /**
         * Checks if a user is currently logged in via sessionStorage.
         */
        checkLoginStatus: () => {
            const token = sessionStorage.getItem('sessionToken');
            const user = JSON.parse(sessionStorage.getItem('currentUser'));
            if (token && user) {
                _state.currentUser = user;
                Utils.show(Utils.getEl('admin-panel'));
                Utils.hide(Utils.getEl('login-gate'));
                Utils.show(Utils.getEl('user-dropdown'));
                Utils.getEl('username-display').textContent = _state.currentUser.username;
                Admin.init(); // Initialize admin-specific logic
            } else {
                Utils.hide(Utils.getEl('admin-panel'));
                Utils.show(Utils.getEl('login-gate'));
                Utils.hide(Utils.getEl('user-dropdown'));
            }
        },

        /**
         * Handles the user login process.
         */
        login: async () => {
            const username = Utils.getEl('username-input').value.trim();
            const password = Utils.getEl('password-input').value.trim();
            if (!username || !password) {
                return UI.Modal.show('กรุณากรอก Username และ Password', 'warning');
            }
            
            UI.toggleLoader(true);
            try {
                const result = await API.post('secureLogin', { username, password });
                if (result.success) {
                    sessionStorage.setItem('sessionToken', result.token);
                    sessionStorage.setItem('currentUser', JSON.stringify(result.user));
                    Auth.checkLoginStatus();
                    UI.Toast.show(`ยินดีต้อนรับ, ${result.user.username}!`, 'success');
                } else {
                    UI.Modal.show(result.message || 'Login failed', 'error');
                }
            } finally {
                UI.toggleLoader(false);
            }
        },

        /**
         * Handles the user logout process.
         */
        logout: () => {
            sessionStorage.clear();
            _state.currentUser = { username: '', role: '' };
            Auth.checkLoginStatus();
            // Redirect or show message
            UI.Toast.show('ออกจากระบบแล้ว', 'info');
        },

        /**
         * Handles changing the user's own password.
         */
        changePassword: async () => {
            const currentPassword = Utils.getEl('current-password').value;
            const newPassword = Utils.getEl('new-password-modal').value;
            const confirmPassword = Utils.getEl('confirm-password-modal').value;

            if (!currentPassword || !newPassword || !confirmPassword) {
                return UI.Toast.show('กรุณากรอกข้อมูลให้ครบทุกช่อง', 'warning');
            }
            if (newPassword !== confirmPassword) {
                return UI.Toast.show('รหัสผ่านใหม่ไม่ตรงกัน', 'error');
            }

            UI.toggleLoader(true);
            const result = await API.post('secureUpdateOwnPassword', {
                username: _state.currentUser.username,
                currentPassword: currentPassword,
                newPassword: newPassword,
            });
            UI.toggleLoader(false);

            if (result.success) {
                // Close the bootstrap modal
                const modalEl = Utils.getEl('changePasswordModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();
                UI.Modal.show('เปลี่ยนรหัสผ่านสำเร็จ!', 'success');
            } else {
                UI.Toast.show(result.message, 'error');
            }
        }
    };


    // ==========================================================
    // =================== STORE MODULE (Public Page) ===========
    // ==========================================================
    const Store = {
        /**
         * Initializes the public-facing store page.
         */
        init: () => {
            Store.loadData();
            Store.setupEventListeners();
            UI.Animation.init();
        },

        /**
         * Loads all necessary data for the store page (products, categories).
         */
        loadData: async () => {
            UI.toggleLoader(true);
            try {
                const [productsResult, categoriesResult] = await Promise.all([
                    API.get(`${_config.scriptURL}?action=getProducts`),
                    API.get(`${_config.scriptURL}?action=getCategories`)
                ]);

                if (productsResult.success) {
                    _state.allProducts = productsResult.data;
                    _state.filteredProducts = productsResult.data; // Initially show all
                    UI.renderPublicProducts();
                }
                if (categoriesResult.success) {
                    _state.categories = categoriesResult.categories;
                    UI.renderCategories();
                }
            } catch (error) {
                console.error("Failed to load store data:", error);
            } finally {
                UI.toggleLoader(false);
            }
        },
        
        /**
         * Sets up event listeners for the store page.
         */
        setupEventListeners: () => {
            const searchInput = Utils.getEl('search-input');
            const categorySelect = Utils.getEl('category-select');

            if (searchInput) {
                searchInput.addEventListener('input', Utils.debounce((e) => {
                    Store.filterAndSearch(e.target.value, categorySelect.value);
                }, 300));
            }

            if (categorySelect) {
                categorySelect.addEventListener('change', (e) => {
                    Store.filterAndSearch(searchInput.value, e.target.value);
                });
            }
        },

        /**
         * Filters and searches products based on user input.
         * @param {string} searchTerm - The term to search for.
         * @param {string} category - The category to filter by.
         */
        filterAndSearch: (searchTerm, category) => {
            let filtered = [..._state.allProducts];
            
            if (category && category !== 'ทั้งหมด') {
                filtered = filtered.filter(p => p.category === category);
            }
            if (searchTerm) {
                const lowerSearch = searchTerm.toLowerCase();
                filtered = filtered.filter(p => 
                    p.name.toLowerCase().includes(lowerSearch) ||
                    p.id.toString().toLowerCase().includes(lowerSearch)
                );
            }
            
            _state.filteredProducts = filtered;
            UI.renderPublicProducts();
        }
    };


    // ==========================================================
    // =================== ADMIN MODULE =========================
    // ==========================================================
    const Admin = {
        /**
         * Initializes the admin panel.
         */
        init: () => {
            Admin.loadProducts();
            Admin.setupEventListeners();
        },

        /**
         * Loads products for the admin table.
         */
        loadProducts: async () => {
            UI.toggleLoader(true);
            const result = await API.get(`${_config.scriptURL}?action=getProducts`);
            UI.toggleLoader(false);
            if (result.success) {
                _state.allProducts = result.data;
                UI.renderAdminProducts();
            }
        },
        
        /**
         * Sets up event listeners for the admin panel.
         */
        setupEventListeners: () => {
            Utils.getEl('product-form')?.addEventListener('submit', Admin.handleProductFormSubmit);
            Utils.getEl('clear-product-form-btn')?.addEventListener('click', Admin.clearProductForm);
            
            const adminSearchInput = Utils.getEl('admin-search-input');
            if (adminSearchInput) {
                 adminSearchInput.addEventListener('input', Utils.debounce((e) => {
                    UI.renderAdminProducts(e.target.value);
                }, 300));
            }
           
            Utils.getEl('imageFileInput')?.addEventListener('change', Admin.handleImageFileChange);
        },

        /**
         * Handles the submission of the product form (add/edit).
         * @param {Event} e - The form submission event.
         */
        handleProductFormSubmit: async (e) => {
            e.preventDefault();
            const id = Utils.getEl('product-id').value;
            const action = id ? 'secureUpdateProduct' : 'secureAddProduct';
            
            let data = {
                id: id,
                name: Utils.getEl('name').value,
                category: Utils.getEl('category').value,
                price: Utils.getEl('price').value,
                shopee_url: Utils.getEl('shopeeLink').value,
            };

            if (!data.name || !data.category || !data.price) {
                return UI.Modal.show('กรุณากรอกข้อมูลสินค้าให้ครบ (ชื่อ, หมวดหมู่, ราคา)', 'warning');
            }
            
            UI.toggleLoader(true);
            try {
                // Upload new images first
                let uploadedImageUrls = [];
                if (_state.selectedFileBase64.length > 0) {
                    for (let i = 0; i < _state.selectedFileBase64.length; i++) {
                        const uploadResult = await API.post('secureUploadImage', {
                            imageData: _state.selectedFileBase64[i],
                            fileName: _state.selectedFileNames[i],
                            mimeType: `image/${_state.selectedFileNames[i].split('.').pop()}`
                        });
                        if (uploadResult.success) {
                            uploadedImageUrls.push(uploadResult.url);
                        } else {
                            throw new Error('Image upload failed.');
                        }
                    }
                }
                // Combine existing and newly uploaded image URLs
                data.image_url = [..._state.productImages, ...uploadedImageUrls].join(',');

                // Add or update the product data
                const result = await API.post(action, data);
                if (result.success) {
                    UI.Toast.show(`บันทึกสินค้าเรียบร้อย`, 'success');
                    Admin.clearProductForm();
                    Admin.loadProducts(); // Reload products to show changes
                } else {
                    UI.Modal.show(result.message, 'error');
                }
            } catch (error) {
                console.error("Product form submission error:", error);
                UI.Modal.show('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
            } finally {
                UI.toggleLoader(false);
            }
        },

        /**
         * Clears the product form and resets its state.
         */
        clearProductForm: () => {
            Utils.getEl('product-form')?.reset();
            Utils.getEl('product-id').value = '';
            Utils.getEl('form-title').textContent = 'เพิ่มสินค้าใหม่';
            _state.productImages = [];
            _state.selectedFileBase64 = [];
            _state.selectedFileNames = [];
            UI.renderImagePreviews();
        },

        /**
         * Populates the form with data of a product to be edited.
         * @param {string} id - The ID of the product to edit.
         */
        editProduct: (id) => {
            const product = _state.allProducts.find(p => p.id == id);
            if (!product) return;

            Utils.getEl('product-id').value = product.id;
            Utils.getEl('name').value = product.name;
            Utils.getEl('category').value = product.category;
            Utils.getEl('price').value = product.price;
            Utils.getEl('shopeeLink').value = product.shopee_url;
            Utils.getEl('form-title').textContent = `แก้ไขสินค้า: ${product.name}`;
            
            _state.productImages = String(product.image_url || '').split(',').filter(Boolean);
            _state.selectedFileBase64 = [];
            _state.selectedFileNames = [];
            
            UI.renderImagePreviews();
            Utils.getEl('product-management-section').scrollIntoView({ behavior: 'smooth' });
        },

        /**
         * Deletes a product after confirmation.
         * @param {string} id - The ID of the product to delete.
         */
        deleteProduct: async (id) => {
            const confirmed = await UI.Modal.show('คุณแน่ใจหรือไม่ว่าต้องการลบสินค้านี้? การกระทำนี้ไม่สามารถย้อนกลับได้', 'warning', true);
            if (!confirmed) return;

            UI.toggleLoader(true);
            const result = await API.post('secureDeleteProduct', { id });
            UI.toggleLoader(false);

            if (result.success) {
                UI.Toast.show('ลบสินค้าแล้ว', 'success');
                Admin.loadProducts(); // Refresh the list
            } else {
                UI.Modal.show(result.message, 'error');
            }
        },

        /**
         * Handles the selection of image files for upload.
         * @param {Event} event - The file input change event.
         */
        handleImageFileChange: (event) => {
            const files = event.target.files;
            if (!files) return;

            // Reset new file selections
            _state.selectedFileBase64 = [];
            _state.selectedFileNames = [];
            
            Array.from(files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    _state.selectedFileBase64.push(e.target.result.split(',')[1]);
                    _state.selectedFileNames.push(file.name);
                    // Re-render previews after each file is read
                    UI.renderImagePreviews();
                };
                reader.readAsDataURL(file);
            });
             // Clear the file input value to allow re-selecting the same file
            event.target.value = '';
        },

        /**
         * Removes an image from the preview area in the form.
         * @param {number} index - The index of the image to remove.
         * @param {boolean} isExisting - True if the image is an existing one (URL).
         */
        removeImage: (index, isExisting) => {
            if (isExisting) {
                _state.productImages.splice(index, 1);
            } else {
                // Adjust index for the new files array
                const newIndex = index - _state.productImages.length;
                _state.selectedFileBase64.splice(newIndex, 1);
                _state.selectedFileNames.splice(newIndex, 1);
            }
            UI.renderImagePreviews();
        }
    };


    /**
     * Main application initializer.
     * Determines the current page and initializes the relevant modules.
     */
    const init = () => {
        const path = window.location.pathname;
        if (path.includes('admin.html')) {
            // Setup global listeners for admin page
            Utils.getEl('secure-login-btn')?.addEventListener('click', Auth.login);
            Utils.getEl('password-input')?.addEventListener('keypress', (e) => e.key === 'Enter' && Auth.login());
            Utils.getEl('logout-btn')?.addEventListener('click', Auth.logout);
            Utils.getEl('submit-change-password-btn')?.addEventListener('click', Auth.changePassword);
            Auth.checkLoginStatus();
        } else {
            Store.init();
        }
    };

    // Publicly exposed methods
    return {
        init,
        Admin // Expose Admin module for inline event handlers (onclick)
    };

})();

// Start the application once the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', App.init);
