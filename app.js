// ==========================================================
// =================== CONFIGURATION ========================
// ==========================================================
// !!! Google Apps Script URL (Deployed Web App URL) !!!
// Make sure this URL is correct and your Apps Script is deployed as a Web App
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyfmGkOiQoC4RvPQbdGP7cRbcCcsKSUggk96AyZGjcHMC7RquVXMrZzANlgL_AyRWLm/exec'; // Placeholder, replace with your actual URL

// !!! Admin Secret Key (Must match the one set in Google Apps Script) !!!
const ADMIN_SECRET_KEY = '1234';
// ==========================================================

// Global variables to store product data and current states
let allProducts = [];
let currentFilter = 'ทั้งหมด'; // Stores the currently selected category filter
let currentSearchTerm = ''; // Stores the current search query
let selectedFileBase64 = ''; // Stores the Base64 string of the selected image for upload

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
const show = (el) => el.classList.remove('d-none');

/**
 * Hides a DOM element by adding the 'd-none' class.
 * @param {HTMLElement} el - The element to hide.
 */
const hide = (el) => el.classList.add('d-none');

/**
 * Debounce function to limit the rate at which a function is called.
 * Useful for search inputs to prevent excessive function calls or API requests.
 * @param {Function} func - The function to debounce.
 * @param {number} delay - The delay in milliseconds.
 * @returns {Function} A debounced version of the function.
 */
const debounce = (func, delay) => {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
};

// ---- Custom Alert/Confirm Modals (for professional UI) ----
/**
 * Shows a custom alert modal.
 * @param {string} message - The message to display.
 * @param {string} [type='info'] - Type of alert (info, success, error, warning).
 */
function showCustomAlert(message, type = 'info') {
    const modalHtml = `
        <div class="custom-modal-overlay show">
            <div class="custom-modal animate__animated animate__fadeInDown">
                <div class="custom-modal-header">
                    <h5 class="custom-modal-title">แจ้งเตือน</h5>
                    <button type="button" class="custom-modal-close" aria-label="Close">&times;</button>
                </div>
                <div class="custom-modal-body">
                    <p class="text-${type}">${message}</p>
                </div>
                <div class="custom-modal-footer">
                    <button type="button" class="btn btn-primary custom-modal-ok">ตกลง</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalOverlay = document.querySelector('.custom-modal-overlay');

    const closeModal = () => {
        modalOverlay.classList.add('animate__fadeOutUp');
        modalOverlay.addEventListener('animationend', () => modalOverlay.remove(), { once: true });
    };

    modalOverlay.querySelector('.custom-modal-ok').addEventListener('click', closeModal);
    modalOverlay.querySelector('.custom-modal-close').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { // Close when clicking outside modal content
        if (e.target === modalOverlay) {
            closeModal();
        }
    });
}

/**
 * Shows a custom confirmation modal.
 * @param {string} message - The message to display.
 * @returns {Promise<boolean>} Resolves to true if confirmed, false otherwise.
 */
function showCustomConfirm(message) {
    return new Promise((resolve) => {
        const modalHtml = `
            <div class="custom-modal-overlay show">
                <div class="custom-modal animate__animated animate__fadeInDown">
                    <div class="custom-modal-header">
                        <h5 class="custom-modal-title">ยืนยัน</h5>
                        <button type="button" class="custom-modal-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="custom-modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="custom-modal-footer">
                        <button type="button" class="btn btn-secondary custom-modal-cancel me-2">ยกเลิก</button>
                        <button type="button" class="btn btn-danger custom-modal-ok">ยืนยัน</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalOverlay = document.querySelector('.custom-modal-overlay');

        const cleanup = (result) => {
            modalOverlay.classList.add('animate__fadeOutUp');
            modalOverlay.addEventListener('animationend', () => {
                modalOverlay.remove();
                resolve(result);
            }, { once: true });
        };

        modalOverlay.querySelector('.custom-modal-ok').addEventListener('click', () => cleanup(true));
        modalOverlay.querySelector('.custom-modal-cancel').addEventListener('click', () => cleanup(false));
        modalOverlay.querySelector('.custom-modal-close').addEventListener('click', () => cleanup(false));
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                cleanup(false);
            }
        });
    });
}


// ---- Page Router and Initialization ----
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path.includes('admin.html')) {
        initAdminPage();
    } else {
        initIndexPage();
    }
});

// ---- Index Page Logic (User-facing shop page) ----
async function initIndexPage() {
    const productList = getEl('product-list');
    const loader = getEl('loader');
    const searchInput = getEl('search-input');
    const categoryFilterButtonsDiv = getEl('category-filter-buttons'); // Get the div for dynamic buttons
    const noResults = getEl('no-results');
    const backToTopBtn = getEl('back-to-top');

    // Show loader initially, hide no-results
    show(loader);
    hide(noResults);

    // Fetch products and render
    allProducts = await fetchProducts();
    await fetchAndRenderCategories(categoryFilterButtonsDiv); // Fetch and render categories dynamically
    filterAndRenderProducts(); // Initial rendering
    hide(loader); // Hide loader after initial load

    // Event Listeners for Search Input (Search by ID or Name)
    searchInput.addEventListener('input', debounce((e) => {
        currentSearchTerm = e.target.value.toLowerCase();
        filterAndRenderProducts();
    }, 300)); // Debounce search input to avoid performance issues

    // Event Listener for Back to Top button visibility
    window.addEventListener('scroll', debounce(() => {
        if (window.scrollY > 300) { // Show button after scrolling 300px
            show(backToTopBtn);
        } else {
            hide(backToTopBtn);
        }
    }, 100)); // Debounce scroll event

    // Event Listener for Back to Top button click
    backToTopBtn.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent default anchor link behavior
        window.scrollTo({
            top: 0,
            behavior: 'smooth' // Smooth scroll to the top
        });
    });
}

/**
 * Fetches unique categories from Apps Script and renders them as filter buttons.
 * @param {HTMLElement} containerDiv - The div where category buttons will be appended.
 */
async function fetchAndRenderCategories(containerDiv) {
    // Clear existing buttons first, keep "All" button if it exists
    containerDiv.innerHTML = '<button type="button" class="btn btn-outline-secondary active" data-category="ทั้งหมด">ทั้งหมด</button>';

    const result = await sendDataToApi('getCategories'); // Using sendDataToApi for consistency
    if (result && result.success && result.categories) {
        result.categories.forEach(category => {
            const button = document.createElement('button');
            button.type = 'button';
            button.classList.add('btn', 'btn-outline-secondary');
            button.dataset.category = category;
            button.textContent = category;
            containerDiv.appendChild(button);
        });

        // Add event listeners for all newly created category filter buttons
        containerDiv.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => {
                // Update active class on filter buttons
                containerDiv.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                currentFilter = e.target.dataset.category;
                filterAndRenderProducts();
            });
        });
    } else {
        console.error("Failed to fetch categories:", result ? result.message : "Unknown error");
        // Optionally, show an alert for categories fetch failure
        // showCustomAlert('ไม่สามารถดึงหมวดหมู่สินค้าได้', 'error');
    }
}


/**
 * Filters products based on current search term and category, then renders them.
 */
function filterAndRenderProducts() {
    const productList = getEl('product-list');
    const noResults = getEl('no-results');

    // Clear previous products
    productList.innerHTML = '';

    let filteredProducts = allProducts.filter(product => {
        const matchesCategory = currentFilter === 'ทั้งหมด' || product.category === currentFilter;
        // Search in product name OR ID (case-insensitive)
        const matchesSearch = product.name.toLowerCase().includes(currentSearchTerm) ||
                                (product.id && product.id.toLowerCase().includes(currentSearchTerm));
        return matchesCategory && matchesSearch;
    });

    if (filteredProducts.length === 0) {
        show(noResults); // Show no results message
    } else {
        hide(noResults); // Hide no results message
        filteredProducts.forEach(product => {
            productList.appendChild(createProductCard(product));
        });
    }
}

/**
 * Creates an HTML product card element.
 * @param {Object} product - The product data object.
 * @returns {HTMLElement} The created product card div.
 */
function createProductCard(product) {
    const colDiv = document.createElement('div');
    colDiv.classList.add('col'); // Bootstrap column for grid layout

    // Determine if it's a featured mobile product for special styling (featured removed, so this will be simplified)
    // No 'featured' field anymore, so direct class applied or removed for simplicity
    // If you add a 'badge' field again, uncomment the badge span.
    colDiv.innerHTML = `
        <div class="product-card animate__animated animate__fadeInUp h-100">
            <img src="${product.image_url}" class="card-img-top" alt="${product.name}" onerror="this.onerror=null;this.src='https://placehold.co/400x250/cccccc/333333?text=Image+Not+Found';" loading="lazy">
            <div class="card-body">
                <h5 class="card-title">${product.name}</h5>
                <p class="product-price">${parseFloat(product.price).toLocaleString('th-TH')} บาท</p>
                <a href="${product.shopee_url}" target="_blank" class="btn btn-shopee mt-auto" rel="noopener noreferrer">
                    <i class="fas fa-shopping-cart me-2"></i>ดูใน Shopee
                </a>
            </div>
        </div>
    `;
    return colDiv;
}

// ---- Admin Page Logic ----
async function initAdminPage() {
    const loginGate = getEl('login-gate');
    const adminPanel = getEl('admin-panel');
    const loginBtn = getEl('login-btn');
    const passwordInput = getEl('password-input');
    const productForm = getEl('product-form');
    const clearBtn = getEl('clear-btn');
    const adminSearchInput = getEl('admin-search-input');
    const logoutBtn = getEl('logout-btn');
    const imageFileInput = getEl('imageFileInput'); // Get the new file input
    const imagePreview = getEl('imagePreview'); // Get the image preview div
    const imageUrlHiddenInput = getEl('image_url'); // The hidden field that will store the final URL (changed to image_url)

    // Initial check for login status
    if (sessionStorage.getItem('secretKey') === ADMIN_SECRET_KEY) {
        show(adminPanel);
        hide(loginGate);
        await loadAdminData();
    } else {
        show(loginGate);
        hide(adminPanel);
    }

    // Login button event listener
    loginBtn.addEventListener('click', async () => {
        if (passwordInput.value === ADMIN_SECRET_KEY) {
            sessionStorage.setItem('secretKey', ADMIN_SECRET_KEY);
            show(adminPanel);
            hide(loginGate);
            await loadAdminData();
        } else {
            showCustomAlert('รหัสผ่านไม่ถูกต้อง!', 'error'); // Use custom alert
            passwordInput.value = ''; // Clear password field
        }
    });

    // Logout button event listener
    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('secretKey');
        hide(adminPanel);
        show(loginGate);
        passwordInput.value = ''; // Clear password on logout
        showCustomAlert('ออกจากระบบแล้ว', 'info');
    });

    // Event listener for image file input change
    imageFileInput.addEventListener('change', handleImageFileChange);

    // Product form submission handler
    productForm.addEventListener('submit', handleProductFormSubmit);
    // Clear form button handler
    clearBtn.addEventListener('click', clearForm);

    // Admin product search input handler (Search by ID or Name)
    adminSearchInput.addEventListener('input', debounce((e) => {
        const searchTerm = e.target.value.toLowerCase();
        renderAdminProducts(allProducts.filter(product =>
            product.name.toLowerCase().includes(searchTerm) ||
            (product.id && product.id.toLowerCase().includes(searchTerm))
        ));
    }, 300));

    /**
     * Handles the change event of the image file input.
     * Displays image previews and converts the first selected file to Base64.
     */
    function handleImageFileChange(event) {
        const files = event.target.files;
        imagePreview.innerHTML = ''; // Clear previous previews
        selectedFileBase64 = ''; // Reset Base64 string

        if (files.length > 0) {
            // Display previews for all selected files (up to a limit if desired)
            Array.from(files).forEach((file, index) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const imgDiv = document.createElement('div');
                    imgDiv.classList.add('position-relative', 'me-2', 'mb-2');
                    imgDiv.style.width = '100px';
                    imgDiv.style.height = '100px';
                    imgDiv.style.overflow = 'hidden';
                    imgDiv.style.borderRadius = 'var(--border-radius-sm)';

                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'cover';
                    imgDiv.appendChild(img);
                    imagePreview.appendChild(imgDiv);

                    // For now, we take the first image for the main product image upload
                    if (index === 0) {
                        selectedFileBase64 = e.target.result; // Store Base64 of the first image
                    }
                };
                reader.readAsDataURL(file); // Read file as Data URL (Base64)
            });

            // Set the hidden image_url to an empty string or placeholder if new files are selected
            // It will be populated with the actual URL from Apps Script after successful upload.
            imageUrlHiddenInput.value = '';
        }
    }
}

/**
 * Loads product data for the admin panel and renders the product table.
 */
async function loadAdminData() {
    const adminProductListDiv = getEl('admin-product-list');
    const loader = getEl('loader'); // Assuming admin page also has a loader

    show(loader); // Show loader for admin table
    allProducts = await fetchProducts(); // Fetch all products for admin
    renderAdminProducts(allProducts); // Render products in the admin table
    hide(loader); // Hide loader
}

/**
 * Renders products in the admin table.
 * @param {Array<Object>} productsToRender - List of products to display.
 */
function renderAdminProducts(productsToRender) {
    const adminProductListDiv = getEl('admin-product-list');
    adminProductListDiv.innerHTML = ''; // Clear existing table content

    if (productsToRender.length === 0) {
        adminProductListDiv.innerHTML = '<p class="text-center text-muted">ไม่พบสินค้า</p>';
        return;
    }

    // Create table structure dynamically
    const table = document.createElement('table');
    table.classList.add('table', 'table-hover', 'admin-product-table');
    table.innerHTML = `
        <thead>
            <tr>
                <th>รูปภาพ</th>
                <th>ID สินค้า</th> <!-- Added Product ID column -->
                <th>ชื่อสินค้า</th>
                <th>หมวดหมู่</th>
                <th>ราคา</th>
                <th>ลิงก์ Shopee</th>
                <th>จัดการ</th>
            </tr>
        </thead>
        <tbody>
        </tbody>
    `;
    const tbody = table.querySelector('tbody');

    productsToRender.forEach(product => {
        const row = tbody.insertRow();
        row.dataset.productId = product.id; // Store product ID for easy access

        row.innerHTML = `
            <td><img src="${product.image_url}" alt="${product.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: var(--border-radius-sm);" onerror="this.onerror=null;this.src='https://placehold.co/60x60/cccccc/333333?text=NoImg';"></td>
            <td>${product.id}</td> <!-- Display Product ID -->
            <td>${product.name}</td>
            <td>${product.category}</td>
            <td>${parseFloat(product.price).toLocaleString('th-TH')}</td>
            <td><a href="${product.shopee_url}" target="_blank" class="btn btn-sm btn-outline-info" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i></a></td>
            <td>
                <button class="btn btn-sm btn-warning edit-btn" data-id="${product.id}" title="แก้ไข"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger delete-btn" data-id="${product.id}" title="ลบ"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
    });

    adminProductListDiv.appendChild(table);

    // Add event listeners for edit and delete buttons
    adminProductListDiv.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', (e) => editProduct(e.currentTarget.dataset.id));
    });
    adminProductListDiv.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', (e) => deleteProduct(e.currentTarget.dataset.id));
    });
}

/**
 * Handles product form submission (add or update).
 * This function now also handles image upload if a file is selected.
 * @param {Event} event - The form submission event.
 */
async function handleProductFormSubmit(event) {
    event.preventDefault(); // Prevent default form submission
    const productId = getEl('product-id').value;
    const isEdit = !!productId; // True if product ID exists (editing), false if adding new

    const imageFileInput = getEl('imageFileInput');
    const imageUrlHiddenInput = getEl('image_url'); // Corrected ID

    // Basic validation for required fields
    if (!getEl('name').value || !getEl('category').value || isNaN(parseFloat(getEl('price').value))) {
        showCustomAlert('กรุณากรอกข้อมูลสินค้าที่จำเป็นให้ครบถ้วน (ชื่อ, หมวดหมู่, ราคา)', 'warning');
        return;
    }
    if (parseFloat(getEl('price').value) <= 0) {
        showCustomAlert('ราคาสินค้าต้องมากกว่า 0', 'warning');
        return;
    }

    let productImageUrl = imageUrlHiddenInput.value; // Start with current hidden URL

    // If new files are selected, attempt to upload the first one
    if (imageFileInput.files.length > 0) {
        showCustomAlert('กำลังอัปโหลดรูปภาพ...', 'info');
        const uploadResult = await sendDataToApi('uploadImage', {
            imageData: selectedFileBase64, // Use the pre-converted Base64 string
            fileName: imageFileInput.files[0].name,
            mimeType: imageFileInput.files[0].type
        });

        if (uploadResult && uploadResult.success) {
            productImageUrl = uploadResult.image_url; // Get the public URL from Apps Script (changed to image_url)
            showCustomAlert('อัปโหลดรูปภาพสำเร็จ!', 'success');
        } else {
            showCustomAlert('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ' + (uploadResult ? uploadResult.message : 'ไม่สามารถเชื่อมต่อ API ได้'), 'error');
            // Important: Decide whether to proceed with product save without image or stop
            return; // Stop if image upload fails
        }
    } else if (!isEdit && !productImageUrl) {
        // If adding new product and no image selected, and no imageUrl manually provided
        showCustomAlert('กรุณาเลือกรูปภาพสินค้า หรือใส่ลิงก์รูปภาพ', 'warning');
        return;
    }


    const productData = {
        name: getEl('name').value,
        category: getEl('category').value,
        price: parseFloat(getEl('price').value),
        image_url: productImageUrl, // Use the uploaded URL or existing URL (changed to image_url)
        shopee_url: getEl('shopeeLink').value || '' // Use shopee_url, but form input ID is shopeeLink
    };

    let result;
    if (isEdit) {
        productData.id = productId;
        result = await sendDataToApi('updateProduct', productData);
    } else {
        result = await sendDataToApi('addProduct', productData);
    }

    if (result && result.success) {
        showCustomAlert(isEdit ? 'แก้ไขสินค้าเรียบร้อย!' : 'เพิ่มสินค้าเรียบร้อย!', 'success');
        clearForm();
        await loadAdminData();
    } else {
        showCustomAlert('เกิดข้อผิดพลาด: ' + (result ? result.message : 'ไม่สามารถเชื่อมต่อ API ได้'), 'error');
    }
}

/**
 * Populates the product form with data for editing an existing product.
 * @param {string} productId - The ID of the product to edit.
 */
function editProduct(productId) {
    const product = allProducts.find(p => p.id === productId);
    const imageUrlHiddenInput = getEl('image_url'); // Corrected ID
    const imagePreview = getEl('imagePreview');
    const imageFileInput = getEl('imageFileInput');


    if (product) {
        getEl('form-title').textContent = 'แก้ไขสินค้า';
        getEl('product-id').value = product.id;
        getEl('name').value = product.name;
        getEl('category').value = product.category;
        getEl('price').value = product.price;
        getEl('shopeeLink').value = product.shopee_url || ''; // Use shopee_url, but form input ID is shopeeLink

        // Populate the hidden image_url input
        imageUrlHiddenInput.value = product.image_url || ''; // Changed to image_url

        // Clear file input and preview when editing (user can choose new file)
        imageFileInput.value = '';
        imagePreview.innerHTML = '';
        selectedFileBase64 = ''; // Clear stored Base64

        // Display current product image in preview area (if URL exists)
        if (product.image_url) { // Changed to image_url
            const imgDiv = document.createElement('div');
            imgDiv.classList.add('position-relative', 'me-2', 'mb-2');
            imgDiv.style.width = '100px';
            imgDiv.style.height = '100px';
            imgDiv.style.overflow = 'hidden';
            imgDiv.style.borderRadius = 'var(--border-radius-sm)';

            const img = document.createElement('img');
            img.src = product.image_url; // Changed to image_url
            img.alt = product.name;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            imgDiv.appendChild(img);
            imagePreview.appendChild(imgDiv);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top to show the form
    }
}

/**
 * Deletes a product after confirmation.
 * @param {string} productId - The ID of the product to delete.
 */
async function deleteProduct(productId) {
    const confirmed = await showCustomConfirm('คุณแน่ใจหรือไม่ที่จะลบสินค้านี้?');
    if (confirmed) {
        const result = await sendDataToApi('deleteProduct', { id: productId });
        if (result && result.success) {
            showCustomAlert('ลบสินค้าเรียบร้อย!', 'success');
            await loadAdminData();
        } else {
            showCustomAlert('เกิดข้อผิดพลาดในการลบสินค้า: ' + (result ? result.message : 'ไม่สามารถเชื่อมต่อ API ได้'), 'error');
        }
    }
}

/**
 * Clears the product form and resets it for adding a new product.
 */
function clearForm() {
    getEl('form-title').textContent = 'เพิ่มสินค้าใหม่';
    getEl('product-form').reset();
    getEl('product-id').value = '';
    getEl('shopeeLink').value = ''; // Ensure shopeeLink is cleared
    
    // Clear file input and image preview
    getEl('imageFileInput').value = '';
    getEl('imagePreview').innerHTML = '';
    getEl('image_url').value = ''; // Clear the hidden URL (changed to image_url)
    selectedFileBase64 = ''; // Clear stored Base64
}

// ---- CORE API Communication ----
/**
 * Fetches product data from the Google Apps Script API.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of product objects.
 */
async function fetchProducts() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getProducts`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (result.success) {
            return result.data || [];
        } else {
            console.error("API Error (fetchProducts):", result.message);
            showCustomAlert('ไม่สามารถดึงข้อมูลสินค้าได้: ' + result.message, 'error');
            return [];
        }
    } catch (error) {
        console.error("Fetch Error (fetchProducts):", error);
        showCustomAlert('ไม่สามารถดึงข้อมูลสินค้าได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือคอนโซล', 'error');
        return [];
    }
}

/**
 * Sends data (add, update, delete, uploadImage, getCategories) to the Google Apps Script API.
 * @param {string} action - The action to perform (e.g., 'addProduct', 'updateProduct', 'deleteProduct', 'uploadImage', 'getCategories').
 * @param {Object} [data] - The data payload for the action (optional).
 * @returns {Promise<Object>} A promise that resolves to the API response.
 */
async function sendDataToApi(action, data = {}) { // Made data optional
    try {
        let requestBody;
        let method = 'POST'; // Default for admin actions

        if (action === 'getCategories' || action === 'getProducts') {
            // For GET requests like getCategories, parameters are in URL, not body
            method = 'GET';
            // Construct URL with action parameter for GET requests
            const url = new URL(APPS_SCRIPT_URL);
            url.searchParams.append('action', action);
            if (action === 'getProducts' && data.id) { // Example for specific product by ID if needed later
                 url.searchParams.append('id', data.id);
            }
            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();

        } else {
            // For POST requests (addProduct, updateProduct, deleteProduct, uploadImage)
            requestBody = JSON.stringify({
                secretKey: sessionStorage.getItem('secretKey'),
                action: action,
                data: data
            });
        }
        
        const response = await fetch(APPS_SCRIPT_URL, {
            method: method,
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8', // Apps Script generally expects text/plain for JSON body
            },
            body: requestBody // Only include body for POST requests
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Send Data API Error:", error);
        showCustomAlert('เกิดข้อผิดพลาดในการส่งข้อมูล: ' + error.message, 'error');
        return { success: false, message: error.message };
    }
}
