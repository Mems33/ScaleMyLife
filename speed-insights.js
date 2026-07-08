// Vercel Speed Insights initialization
(function() {
  'use strict';
  
  // Check if we're in a browser environment
  if (typeof window === 'undefined') return;
  
  // Initialize the Speed Insights queue
  window.si = window.si || function() {
    (window.siq = window.siq || []).push(arguments);
  };
  
  // Determine the environment
  var isDevelopment = false;
  try {
    isDevelopment = window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname === '';
  } catch (e) {}
  
  // Get the script source
  var scriptSrc = isDevelopment 
    ? 'https://va.vercel-scripts.com/v1/speed-insights/script.debug.js'
    : '/_vercel/speed-insights/script.js';
  
  // Check if script is already loaded
  if (document.head.querySelector('script[src*="' + scriptSrc + '"]')) {
    return;
  }
  
  // Create and inject the script
  var script = document.createElement('script');
  script.src = scriptSrc;
  script.defer = true;
  
  // Add dataset attributes
  script.dataset.sdkn = '@vercel/speed-insights';
  script.dataset.sdkv = '2.0.0';
  
  if (isDevelopment) {
    script.dataset.debug = 'false';
  }
  
  // Error handler
  script.onerror = function() {
    console.log('[Vercel Speed Insights] Failed to load script from ' + scriptSrc + 
                '. Please check if any content blockers are enabled and try again.');
  };
  
  // Inject the script
  document.head.appendChild(script);
})();
