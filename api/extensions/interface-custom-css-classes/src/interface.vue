<template>
	<!-- No visible elements needed -->
  </template>
  
  <script>
  /**
   * Custom CSS Class Adder Interface
   * This component dynamically manages CSS classes on DOM elements based on configured selectors.
   * It supports both adding new classes and removing existing ones, maintaining the changes even when classes are modified elsewhere.
   */
  import { onMounted, onUnmounted, ref } from 'vue';
  
  export default {
	props: {
	  value: {
		type: String,
		default: null,
	  },
	  selectorClassPairs: {
		type: Array,
		default: () => [],
	  },
	},
	setup(props) {
	  const observer = ref(null);
  
	  /**
	   * Updates CSS classes on DOM elements based on configuration
	   * Performance optimization opportunities:
	   * 1. Cache querySelector results when possible
	   * 2. Use Map for faster class lookups
	   * 3. Batch DOM operations using DocumentFragment for multiple elements
	   * 4. Use WeakMap to store observer references for better memory management
	   */
	  function updateClasses() {
		// Process each selector pair
		props.selectorClassPairs.forEach((pair) => {
		  if (!pair.selector) return; // Skip invalid pairs

		  const elements = document.querySelectorAll(pair.selector);
		  
		  elements.forEach(element => {
			// Optimize repaints by batching class changes
			requestAnimationFrame(() => {
			  // Add will-change to optimize browser rendering
			  element.style.willChange = 'contents';
              
			  // Prepare class lists
			  const classesToRemove = pair.classesToRemove ? 
				pair.classesToRemove.split(' ')
				  .map(cls => cls.trim())
				  .filter(Boolean) : [];
              
			  const classesToAdd = pair.classesToAdd ? 
				pair.classesToAdd.split(' ')
				  .map(cls => cls.trim())
				  .filter(Boolean) : [];
              
			  const classSet = new Set(classesToAdd);

			  // Batch DOM operations
			  if (classesToRemove.length > 0 || classesToAdd.length > 0) {
				element.classList.remove(...classesToRemove);
				element.classList.add(...classesToAdd);
			  }

			  // Set up observer for maintaining added classes
			  if (classesToAdd.length > 0) {
				const observer = new MutationObserver(() => {
				  requestAnimationFrame(() => {
					classSet.forEach(cls => {
					  if (!element.classList.contains(cls)) {
						element.classList.add(cls);
					  }
					});
				  });
				});

				observer.observe(element, { 
				  attributes: true, 
				  attributeFilter: ['class'],
				  attributeOldValue: true 
				});

				// Store the observer for cleanup
				if (!observer.value) observer.value = [];
				observer.value.push(observer);
			  }

			  // Remove will-change after changes are applied
			  requestAnimationFrame(() => {
				element.style.willChange = 'auto';
			  });
			});
		  });
		});
	  }
  
	  onMounted(() => {
		// Initialize class management
		updateClasses();
  
		// Create style tag with optimized rules
		const style = document.createElement('style');
		const styleRules = props.selectorClassPairs
		  .filter(pair => pair.selector && pair.classesToAdd)
		  .map(pair => {
			const classes = pair.classesToAdd.split(' ')
			  .map(cls => cls.trim())
			  .filter(Boolean)
			  .join('.');
			// Add contain property to optimize rendering
			return `${pair.selector}.${classes} { contain: layout style; /* Managed by Class Adder */ }`;
		  })
		  .join('\n');
		
		style.innerHTML = styleRules;
		document.head.appendChild(style);
	  });
  
	  onUnmounted(() => {
		// Clean up observers
		if (observer.value) {
		  observer.value.forEach(obs => obs.disconnect());
		}
	  });
  
	  return {
		updateClasses,
	  };
	},
  };
  </script>
