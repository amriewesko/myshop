// ==========================================================
// =================== CONFIGURATION ========================\r\n
// ==========================================================\r\n
// !!! Google Apps Script URL (Deployed Web App URL for public access) !!!
// Make sure this URL is correct and your Apps Script is deployed as a Web App
// IMPORTANT: REPLACE THIS PLACEHOLDER WITH YOUR ACTUAL DEPLOYED GOOGLE APPS SCRIPT URL (e.g., ends with /exec)
// This URL will be used by the public-facing index.html to fetch products and categories.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzYC0Ao9CLiOUc-v7DrWqrxXQMkfkLo_GfWi8jHRyhjw0iSdw17B_cr_BxxesOcALJz/exec'; // Placeholder, replace with your actual URL

// Removed ADMIN_SECRET_KEY as admin functionality is now handled by a separate, authenticated Apps Script Web App.
// ==========================================================\r\n

// Global variables to store product data and current states
let allProducts = [];
let currentFilter = 'ทั้งหมด'; // Stores the currently selected category filter
let currentSearchTerm = ''; // Stores the current search query

// ---- Helper Functions ----
/**
 * Safely gets a DOM element by its ID.
 * @param {string} id - The ID of the element.
 * @returns {HTMLElement|null} The DOM element or null if not found.
 */
function getEl(id) {
    return document.getElementById(id);
}

/**
 * Shows a DOM element by removing 'd-none' class.
 * @param {HTMLElement} element - The element to show.
 */
function show(element) {
    if (element && element.classList.contains('d-none')) {
        element.classList.remove('d-none');
    }
}

/**
 * Hides a DOM element by adding 'd-none' class.
 * @param {HTMLElement} element - The element to hide.
 */
function hide(element) {
    if (element && !element.classList.contains('d-none')) {
        element.classList.add('d-none');
    }
}

/**
 * Shows a custom alert modal.
 * @param {string} message - The message to display.
 * @param {string} type - 'success', 'error', 'warning'.
 */
function showCustomAlert(message, type) {
    const overlay = getEl('custom-modal-overlay');
    if (!overlay) {
        console.error('Custom modal overlay not found!');
        alert(message); // Fallback to native alert
        return;
    }

    overlay.innerHTML = `
        <div class="custom-modal animate__animated animate__zoomIn">
            <div class="custom-modal-header ${type}">
                ${type === 'success' ? '<i class="fas fa-check-circle"></i>' : type === 'error' ? '<i class="fas fa-times-circle"></i>' : '<i class="fas fa-exclamation-triangle"></i>'}
            </div>
            <div class="custom-modal-body">
                <p>${message}</p>
            </div>
            <div class="custom-modal-footer">
                <button id="modal-ok-btn" class="btn btn-primary">ตกลง</button>
            </div>
        </div>
    `;
    show(overlay);

    getEl('modal-ok-btn').onclick = () => {
        hide(overlay);
    };
}


// --- DOM Elements ---
const productList = getEl('product-list');
const categoryFilter = getEl('category-filter');
const searchInput = getEl('search-input');
const searchButton = getEl('search-button');
const loader = getEl('loader');
const backToTopButton = getEl('back-to-top');

// --- Core Functions ---

/**
 * Fetches data from Google Apps Script.
 * @param {string} action - The action to perform (e.g., 'getProducts', 'getCategories').
 * @param {Object} [params={}] - Optional parameters for the request.
 * @returns {Promise<Object>} The response from Google Apps Script.
 */
async function fetchData(action, params = {}) {
    const urlParams = new URLSearchParams(params);
    urlParams.append('action', action);
    const url = `${APPS_SCRIPT_URL}?${urlParams.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching data:', error);
        showCustomAlert('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์: ' + error.message, 'error');
        throw error;
    }
}

/**
 * Renders product categories in the filter dropdown.
 * @param {string[]} categories - Array of unique category strings.
 */
function renderCategories(categories) {
    categoryFilter.innerHTML = '<option value="ทั้งหมด">ทั้งหมด</option>'; // Reset and add "All" option
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        // NEW: Use textContent to prevent XSS if category names contain special HTML characters
        option.textContent = category; 
        categoryFilter.appendChild(option);
    });
    // Set the selected value back if a filter was active
    categoryFilter.value = currentFilter;
}

/**
 * Fetches and renders unique product categories.
 */
async function loadCategories() {
    try {
        const response = await fetchData('getCategories');
        if (response.success && response.categories) {
            renderCategories(response.categories);
        } else {
            console.error('Failed to load categories:', response.message);
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

/**
 * Renders products in the product list.
 * @param {Object[]} products - Array of product objects.
 */
function renderProducts(products) {
    productList.innerHTML = ''; // Clear existing products
    if (products.length === 0) {
        productList.innerHTML = '<div class="col-12 text-center text-muted">ไม่พบสินค้าในหมวดหมู่ที่เลือก</div>';
        return;
    }

    products.forEach(product => {
        const col = document.createElement('div');
        col.classList.add('col');
        col.classList.add('animate__animated', 'animate__fadeInUp'); // Animation class for each card

        const imageUrls = product.image_url ? product.image_url.split(',').filter(url => url) : [];
        const firstImageUrl = imageUrls.length > 0 ? imageUrls[0] : 'placeholder.jpg'; // Use a placeholder if no image

        col.innerHTML = `
            <div class="card product-card h-100 shadow-sm">
                <img src="${firstImageUrl}" class="card-img-top" alt="${product.name}">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title">${product.name}</h5>
                    <p class="card-text text-muted">${product.category}</p>
                    <div class="d-flex justify-content-between align-items-center mt-auto pt-2">
                        <span class="price">
                            ${parseFloat(product.price).toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
                        </span>
                        ${product.shopee_url ? `
                            <a href="${product.shopee_url}" target="_blank" class="btn btn-primary btn-add-to-cart">
                                <i class="fas fa-shopping-cart me-1"></i> ซื้อเลย
                            </a>
                        ` : `
                            <button class="btn btn-secondary btn-add-to-cart" disabled>
                                <i class="fas fa-info-circle me-1"></i> ไม่มีลิงก์
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
        // NEW: XSS Protection - Manually set text content for user-generated data
        const cardTitle = col.querySelector('.card-title');
        if (cardTitle) cardTitle.textContent = product.name;
        const cardText = col.querySelector('.card-text');
        if (cardText) cardText.textContent = product.category;

        productList.appendChild(col);
    });
}

/**
 * Fetches and renders all products.
 */
async function loadProducts() {
    show(loader); // Show loader before fetching
    try {
        const response = await fetchData('getProducts');
        if (response.success && response.data) {
            allProducts = response.data; // Store all products
            filterAndSearchProducts(); // Apply current filters/search
        } else {
            showCustomAlert('ไม่สามารถโหลดสินค้าได้: ' + (response.message || 'Unknown error'), 'error');
        }
    } catch (error) {
        // Error already handled by fetchData's showCustomAlert
    } finally {
        hide(loader); // Hide loader after fetching
    }
}

/**
 * Filters products based on selected category and search term.
 */
function filterAndSearchProducts() {
    const searchTerm = currentSearchTerm.toLowerCase().trim();
    const filteredProducts = allProducts.filter(product => {
        const matchesCategory = (currentFilter === 'ทั้งหมด' || product.category === currentFilter);
        const matchesSearch = product.name.toLowerCase().includes(searchTerm) ||
                              product.category.toLowerCase().includes(searchTerm) ||
                              product.id.toLowerCase().includes(searchTerm);
        return matchesCategory && matchesSearch;
    });
    renderProducts(filteredProducts);
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    loadCategories(); // Load categories first
    loadProducts(); // Then load products

    categoryFilter.addEventListener('change', (event) => {
        currentFilter = event.target.value;
        filterAndSearchProducts();
    });

    searchButton.addEventListener('click', () => {
        currentSearchTerm = searchInput.value;
        filterAndSearchProducts();
    });

    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            searchButton.click(); // Trigger search on Enter key
        }
        currentSearchTerm = searchInput.value; // Update search term on keyup for live filtering
        filterAndSearchProducts();
    });

    // Back to top button logic
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            show(backToTopButton);
        } else {
            hide(backToTopButton);
        }
    });

    backToTopButton.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});
