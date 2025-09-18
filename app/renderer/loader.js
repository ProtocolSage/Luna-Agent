// Module loader for Electron renderer
// This properly loads the ES module renderer

(function() {
    // Prevent default drag and drop behavior globally
    window.addEventListener('dragover', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('drop', (e) => e.preventDefault(), { passive: false });
    
    // Load the actual renderer script as a module
    const script = document.createElement('script');
    script.type = 'module';  // Important: Load as ES module
    script.src = './renderer.js';
    script.onload = function() {
        console.log('Renderer module loaded successfully');
    };
    script.onerror = function(error) {
        console.error('Failed to load renderer module:', error);
    };
    document.head.appendChild(script);
})();
