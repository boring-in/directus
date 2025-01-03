import InterfaceComponent from './interface.vue';

export default {
  id: 'custom-css-classes',
  name: 'Custom CSS Classes',
  icon: 'box',
  description: 'Efficiently manages CSS classes on DOM elements with optimized rendering and performance',
  component: InterfaceComponent,
  options: [
    {
      field: 'selectorClassPairs',
      type: 'json',
      name: 'Element Class Management',
      meta: {
        interface: 'list',
        options: {
          template: '{{selector}} -> Add: {{classesToAdd}}, Remove: {{classesToRemove}}',
          fields: [
            {
              field: 'selector',
              type: 'string',
              name: 'Element Selector',
              meta: {
                interface: 'input',
                options: {
              placeholder: 'Enter CSS selector (e.g., #id, .class, [data-*]). Use specific selectors for better performance.'
                }
              }
            },
            {
              field: 'classesToAdd',
              type: 'string',
              name: 'Classes to Add',
              meta: {
                interface: 'input',
                options: {
              placeholder: 'Enter class names to add (space-separated). Group related classes for better performance.'
                }
              }
            },
            {
              field: 'classesToRemove',
              type: 'string',
              name: 'Classes to Remove',
              meta: {
                interface: 'input',
                options: {
              placeholder: 'Enter class names to remove (space-separated). Group related classes for better performance.'
                }
              }
            }
          ]
        }
      }
    }
  ],
  types: ['string'],
};
