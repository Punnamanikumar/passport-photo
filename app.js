// App State
let images = []; // Array of { id, file, originalUrl, croppedUrl, copies, name }
let currentCropId = null;
let cropperInstance = null;
let currentPreviewPage = 1;

// Configuration Constants
const PHOTO_WIDTH_MM = 35;
const PHOTO_HEIGHT_MM = 45;
const GUTTER_MM = 4; // Spacing between photos
const MARGIN_MM = 10; // Safety margin on sheet edges

// Paper Dimensions
const PAPER_DIMENSIONS = {
    a4: { width: 210, height: 297 },
    letter: { width: 215.9, height: 279.4 }
};

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const selectBtn = document.getElementById('select-btn');
const queueSection = document.getElementById('queue-section');
const queueGrid = document.getElementById('queue-grid');
const previewSection = document.getElementById('preview-section');
const virtualSheet = document.getElementById('virtual-sheet');
const paperSizeSelect = document.getElementById('paper-size');
const bgFillSelect = document.getElementById('bg-fill');
const showCropMarksCheck = document.getElementById('show-crop-marks');
const downloadPdfBtn = document.getElementById('download-pdf-btn');
const clearAllBtn = document.getElementById('clear-all-btn');

const statTotalPhotos = document.getElementById('stat-total-photos');
const statTotalPages = document.getElementById('stat-total-pages');
const pageIndicator = document.getElementById('page-indicator');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');

// Cropper Modal Elements
const cropModal = document.getElementById('crop-modal');
const cropperImage = document.getElementById('cropper-image');
const cropModalClose = document.getElementById('crop-modal-close');
const cropCancelBtn = document.getElementById('crop-cancel-btn');
const cropSaveBtn = document.getElementById('crop-save-btn');
const cropRotateLeft = document.getElementById('crop-rotate-left');
const cropRotateRight = document.getElementById('crop-rotate-right');
const cropZoomIn = document.getElementById('crop-zoom-in');
const cropZoomOut = document.getElementById('crop-zoom-out');
const cropReset = document.getElementById('crop-reset');

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

function setupEventListeners() {
    // File inputs
    selectBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelection);

    // Drag and Drop
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            processFiles(files);
        }
    });

    // Modal Crop Controls
    cropModalClose.addEventListener('click', closeCropModal);
    cropCancelBtn.addEventListener('click', closeCropModal);
    cropSaveBtn.addEventListener('click', saveCroppedImage);
    
    cropRotateLeft.addEventListener('click', () => cropperInstance && cropperInstance.rotate(-90));
    cropRotateRight.addEventListener('click', () => cropperInstance && cropperInstance.rotate(90));
    cropZoomIn.addEventListener('click', () => cropperInstance && cropperInstance.zoom(0.1));
    cropZoomOut.addEventListener('click', () => cropperInstance && cropperInstance.zoom(-0.1));
    cropReset.addEventListener('click', () => cropperInstance && cropperInstance.reset());

    // Settings adjustments
    paperSizeSelect.addEventListener('change', () => {
        updatePaperSizeUI();
        renderLayout();
    });
    bgFillSelect.addEventListener('change', renderLayout);
    showCropMarksCheck.addEventListener('change', renderLayout);

    // Download & Actions
    downloadPdfBtn.addEventListener('click', generatePDF);
    clearAllBtn.addEventListener('click', clearAll);

    // Pagination
    prevPageBtn.addEventListener('click', () => changePreviewPage(-1));
    nextPageBtn.addEventListener('click', () => changePreviewPage(1));
}

// --- FILE UPLOAD MANAGEMENT ---
function handleFileSelection(e) {
    const files = e.target.files;
    if (files.length > 0) {
        processFiles(files);
    }
}

function autoCropToCenter(originalUrl, callback) {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetWidth = 413;
        const targetHeight = 531;
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        const imgRatio = img.width / img.height;
        const targetRatio = targetWidth / targetHeight;

        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = img.width;
        let sourceHeight = img.height;

        if (imgRatio > targetRatio) {
            // Image is wider than target ratio - crop sides
            sourceWidth = img.height * targetRatio;
            sourceX = (img.width - sourceWidth) / 2;
        } else {
            // Image is taller than target ratio - crop top/bottom
            sourceHeight = img.width / targetRatio;
            sourceY = (img.height - sourceHeight) / 2;
        }

        ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
        
        try {
            const croppedUrl = canvas.toDataURL('image/jpeg', 0.95);
            callback(croppedUrl);
        } catch (e) {
            console.error('Failed to crop image canvas:', e);
            callback(null);
        }
    };
    img.onerror = () => {
        callback(null);
    };
    img.src = originalUrl;
}

function processFiles(files) {
    let filesAdded = false;

    Array.from(files).forEach(file => {
        if (!file.type.match('image.*')) {
            alert('Only image files (PNG, JPEG, JPG) are supported.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const originalUrl = e.target.result;
            const id = 'img_' + Math.random().toString(36).substr(2, 9);
            
            // Perform default center-crop automatically so it is instantly ready
            autoCropToCenter(originalUrl, (croppedUrl) => {
                images.push({
                    id,
                    file,
                    originalUrl,
                    croppedUrl: croppedUrl, // Automatically set
                    copies: 1,
                    name: file.name
                });
                updateUI();
            });
        };
        reader.readAsDataURL(file);
        filesAdded = true;
    });

    // Reset file input value so same file can be uploaded again if needed
    fileInput.value = '';
}

// --- UI REFRESH AND GRID RENDERING ---
function updateUI() {
    if (images.length > 0) {
        queueSection.classList.remove('hidden');
        previewSection.classList.remove('hidden');
    } else {
        queueSection.classList.add('hidden');
        previewSection.classList.add('hidden');
    }

    renderQueueGrid();
    renderLayout();
}

function renderQueueGrid() {
    queueGrid.innerHTML = '';

    images.forEach(img => {
        const isCropped = img.croppedUrl !== null;
        const displaySrc = isCropped ? img.croppedUrl : img.originalUrl;
        const statusText = isCropped ? 'Cropped' : 'Pending Crop';
        const statusBadgeClass = isCropped ? 'badge-cropped' : 'badge-pending';
        
        const card = document.createElement('div');
        card.className = 'queue-card';
        card.innerHTML = `
            <div class="thumbnail-area">
                <img src="${displaySrc}" alt="${img.name}">
                <span class="badge ${statusBadgeClass}">${statusText}</span>
            </div>
            <div class="card-details">
                <span class="photo-name">${img.name}</span>
                <span class="photo-info">${isCropped ? '3.5 x 4.5 cm configured' : 'Needs crop alignment'}</span>
            </div>
            <div class="copies-control">
                <span>Number of copies</span>
                <div class="qty-selector">
                    <button class="qty-btn dec-btn" data-id="${img.id}"><i class="fa-solid fa-minus"></i></button>
                    <span class="qty-val">${img.copies}</span>
                    <button class="qty-btn inc-btn" data-id="${img.id}"><i class="fa-solid fa-plus"></i></button>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn btn-secondary crop-btn" data-id="${img.id}">
                    <i class="fa-solid fa-crop-simple"></i> Crop
                </button>
                <button class="btn btn-danger btn-icon-only remove-btn" data-id="${img.id}" title="Remove photo">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;

        // Wire up individual card events
        card.querySelector('.inc-btn').addEventListener('click', () => updateCopies(img.id, 1));
        card.querySelector('.dec-btn').addEventListener('click', () => updateCopies(img.id, -1));
        card.querySelector('.crop-btn').addEventListener('click', () => openCropModal(img.id));
        card.querySelector('.remove-btn').addEventListener('click', () => removeImage(img.id));

        queueGrid.appendChild(card);
    });
}

function updateCopies(id, delta) {
    const img = images.find(i => i.id === id);
    if (img) {
        img.copies = Math.max(1, img.copies + delta);
        updateUI();
    }
}

function removeImage(id) {
    images = images.filter(img => img.id !== id);
    updateUI();
}

function clearAll() {
    if (confirm('Are you sure you want to clear all images?')) {
        images = [];
        currentPreviewPage = 1;
        updateUI();
    }
}

function updatePaperSizeUI() {
    const selectedSize = paperSizeSelect.value;
    virtualSheet.className = 'virtual-sheet';
    if (selectedSize === 'a4') {
        virtualSheet.classList.add('paper-a4');
    } else {
        virtualSheet.classList.add('paper-letter');
    }
}

// --- CROPPER MODAL LOGIC ---
function openCropModal(id) {
    const img = images.find(i => i.id === id);
    if (!img) return;

    currentCropId = id;
    
    // Destroy previous instance
    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }

    // Set onload handler before setting src to prevent race conditions (especially when cached)
    cropperImage.onload = () => {
        if (currentCropId !== id) return; // Guard against modal closed while loading
        
        cropperInstance = new Cropper(cropperImage, {
            aspectRatio: PHOTO_WIDTH_MM / PHOTO_HEIGHT_MM, // 35:45 aspect ratio
            viewMode: 1, // Restrict the crop box to not exceed the size of the canvas.
            dragMode: 'move',
            responsive: true,
            background: true,
            autoCropArea: 0.8
        });
        
        cropperImage.onload = null; // Clean up handler
    };

    cropperImage.src = img.originalUrl;
    cropModal.classList.remove('hidden');
    cropModal.classList.add('active');
}

function closeCropModal() {
    cropModal.classList.remove('active');
    cropModal.classList.add('hidden');
    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }
    currentCropId = null;
}

function saveCroppedImage() {
    if (!cropperInstance || !currentCropId) return;

    // Output higher quality coordinates. Passport size matches ~300 DPI for high print quality.
    // 35mm at 300 DPI is (35 / 25.4) * 300 = ~413 pixels.
    // 45mm at 300 DPI is (45 / 25.4) * 300 = ~531 pixels.
    const canvas = cropperInstance.getCroppedCanvas({
        width: 413,
        height: 531,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
    });

    const croppedUrl = canvas.toDataURL('image/jpeg', 0.95);
    
    // Update image model
    const imgIndex = images.findIndex(i => i.id === currentCropId);
    if (imgIndex !== -1) {
        images[imgIndex].croppedUrl = croppedUrl;
    }

    closeCropModal();
    updateUI();
}

// --- LAYOUT & ARRANGEMENT ENGINE ---
function calculateLayout() {
    const sizeName = paperSizeSelect.value;
    const paper = PAPER_DIMENSIONS[sizeName];
    
    const pageW = paper.width;
    const pageH = paper.height;

    // Calculate dimensions
    const printableW = pageW - (MARGIN_MM * 2);
    const printableH = pageH - (MARGIN_MM * 2);

    // Number of columns and rows that fit on page
    const colStep = PHOTO_WIDTH_MM + GUTTER_MM;
    const rowStep = PHOTO_HEIGHT_MM + GUTTER_MM;

    const cols = Math.floor((printableW + GUTTER_MM) / colStep);
    const rows = Math.floor((printableH + GUTTER_MM) / rowStep);
    const capacityPerPage = cols * rows;

    // Gather all cropped items (copies expanded)
    const items = [];
    images.forEach(img => {
        if (img.croppedUrl) {
            for (let c = 0; c < img.copies; c++) {
                items.push({
                    id: img.id,
                    croppedUrl: img.croppedUrl
                });
            }
        }
    });

    const totalPages = Math.max(1, Math.ceil(items.length / capacityPerPage));
    
    // Safety check preview page range
    if (currentPreviewPage > totalPages) {
        currentPreviewPage = totalPages;
    }

    // Grid details for positioning
    const totalW = (PHOTO_WIDTH_MM * cols) + (GUTTER_MM * (cols - 1));
    const totalH = (PHOTO_HEIGHT_MM * rows) + (GUTTER_MM * (rows - 1));

    // Centering calculations
    const startX = MARGIN_MM + (printableW - totalW) / 2;
    const startY = MARGIN_MM + (printableH - totalH) / 2;

    const pagePositions = [];

    // Map each item to exact coordinate positions per page
    for (let p = 0; p < totalPages; p++) {
        const pageItems = items.slice(p * capacityPerPage, (p + 1) * capacityPerPage);
        const itemPositions = pageItems.map((item, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const x = startX + (col * colStep);
            const y = startY + (row * rowStep);
            
            return {
                ...item,
                x,
                y,
                w: PHOTO_WIDTH_MM,
                h: PHOTO_HEIGHT_MM
            };
        });

        pagePositions.push(itemPositions);
    }

    return {
        totalPages,
        pageW,
        pageH,
        pagePositions,
        capacityPerPage,
        totalItemsCount: items.length
    };
}

function renderLayout() {
    const layout = calculateLayout();
    
    // Update Stats
    statTotalPhotos.textContent = layout.totalItemsCount;
    statTotalPages.textContent = layout.totalPages;

    // Set page selectors
    pageIndicator.textContent = `Page ${currentPreviewPage} of ${layout.totalPages}`;
    prevPageBtn.disabled = currentPreviewPage <= 1;
    nextPageBtn.disabled = currentPreviewPage >= layout.totalPages;

    // Clear virtual A4 sheet
    virtualSheet.innerHTML = '';

    const currentPageItems = layout.pagePositions[currentPreviewPage - 1] || [];
    const showGuides = showCropMarksCheck.checked;
    
    currentPageItems.forEach(item => {
        const photoEl = document.createElement('div');
        photoEl.className = 'preview-photo';
        if (showGuides) {
            photoEl.classList.add('with-guide');
        }
        
        // Background Image
        photoEl.style.backgroundImage = `url(${item.croppedUrl})`;

        // Percent-based layout positions inside aspect-ratio viewport
        photoEl.style.left = `${(item.x / layout.pageW) * 100}%`;
        photoEl.style.top = `${(item.y / layout.pageH) * 100}%`;
        photoEl.style.width = `${(item.w / layout.pageW) * 100}%`;
        photoEl.style.height = `${(item.h / layout.pageH) * 100}%`;

        // If background fill is white, verify rendering
        const bgFill = bgFillSelect.value;
        if (bgFill === 'white') {
            photoEl.style.backgroundColor = '#ffffff';
        } else {
            photoEl.style.backgroundColor = 'transparent';
        }

        virtualSheet.appendChild(photoEl);
    });

    // If no cropped photos exist yet
    if (currentPageItems.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-preview-msg';
        emptyMsg.innerHTML = `
            <div style="text-align: center; color: #475569; padding: 20px; font-size: 13px; font-weight: 500;">
                <i class="fa-solid fa-crop" style="font-size: 24px; margin-bottom: 8px;"></i>
                <p>Crop uploaded photos to preview printer layout</p>
            </div>
        `;
        // Centered empty state flex style override
        virtualSheet.style.display = 'flex';
        virtualSheet.style.alignItems = 'center';
        virtualSheet.style.justifyContent = 'center';
        virtualSheet.appendChild(emptyMsg);
    } else {
        virtualSheet.style.display = '';
    }
}

function changePreviewPage(direction) {
    currentPreviewPage += direction;
    renderLayout();
}

// --- PDF GENERATION ENGINE ---
async function generatePDF() {
    const croppedCount = images.filter(img => img.croppedUrl).length;
    if (croppedCount === 0) {
        alert('Please crop at least one image to standard passport size first.');
        return;
    }

    // Indicate loading state
    const originalText = downloadPdfBtn.innerHTML;
    downloadPdfBtn.disabled = true;
    downloadPdfBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generating PDF...`;

    try {
        const layout = calculateLayout();
        const sizeName = paperSizeSelect.value;
        const showGuides = showCropMarksCheck.checked;
        const fillWhite = bgFillSelect.value === 'white';

        // Load jsPDF from global window
        const { jsPDF } = window.jspdf;
        
        // Initialize doc with mm unit size
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: sizeName
        });

        // Clear default auto-created first page bounds
        let pageCount = 0;

        for (let p = 0; p < layout.totalPages; p++) {
            if (pageCount > 0) {
                doc.addPage(sizeName, 'portrait');
            }
            pageCount++;

            const pageItems = layout.pagePositions[p] || [];

            for (const item of pageItems) {
                // If transparent fill enabled, draw background solid color
                if (fillWhite) {
                    doc.setFillColor(255, 255, 255);
                    doc.rect(item.x, item.y, item.w, item.h, 'F');
                }

                // Draw Cropped Image (Base64 JPEG format)
                doc.addImage(item.croppedUrl, 'JPEG', item.x, item.y, item.w, item.h);

                // Draw thin boundary crop mark lines if checked
                if (showGuides) {
                    doc.setDrawColor(200, 200, 200); // Light grey lines
                    doc.setLineWidth(0.1);
                    
                    // Draw outer border guides (slightly offset to assist cut)
                    doc.line(item.x - 1, item.y, item.x + item.w + 1, item.y); // top
                    doc.line(item.x - 1, item.y + item.h, item.x + item.w + 1, item.y + item.h); // bottom
                    doc.line(item.x, item.y - 1, item.x, item.y + item.h + 1); // left
                    doc.line(item.x + item.w, item.y - 1, item.x + item.w, item.y + item.h + 1); // right
                }
            }
        }

        // Save Generated PDF Document
        doc.save(`passport-photos-${sizeName}.pdf`);
    } catch (err) {
        console.error('PDF Generation failed:', err);
        alert('An error occurred while generating the PDF. Please try again.');
    } finally {
        // Reset loading state
        downloadPdfBtn.disabled = false;
        downloadPdfBtn.innerHTML = originalText;
    }
}
