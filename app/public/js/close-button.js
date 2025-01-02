console.log('[directus-utils] Initializing close button script');

function addCloseButton() {
  console.log('[directus-utils] Checking for actions bar...');
  const actionsBar = document.querySelector('.actions-divider');
  if (!actionsBar) {
    console.log('[directus-utils] Actions bar not found');
    return;
  }

  if (document.querySelector('.close-button')) {
    console.log('[directus-utils] Close button already exists');
    return;
  }

  console.log('[directus-utils] Creating close button');
  const closeButton = document.createElement('div');
  closeButton.className = 'close-button';

  const button = document.createElement('button');
  button.className = 'v-button button secondary rounded icon';
  button.style.marginRight = '8px';

  const icon = document.createElement('i');
  icon.className = 'v-icon material-icons';
  icon.textContent = 'close';

  button.appendChild(icon);
  closeButton.appendChild(button);

  actionsBar.parentNode.insertBefore(closeButton, actionsBar);
  console.log('[directus-utils] Close button added to DOM');

  button.addEventListener('click', () => {
    console.log('[directus-utils] Close button clicked');
    const router = window?.$router;
    if (!router) {
      console.log('[directus-utils] Router not found');
      return;
    }

    const backState = router.options.history.state.back;
    const collection = router.currentRoute.value.params.collection;
    console.log('[directus-utils] Navigation state:', { backState, collection });

    if (typeof backState !== 'string' || !backState.startsWith('/login')) {
      console.log('[directus-utils] Navigating back');
      router.back();
    } else {
      console.log('[directus-utils] Navigating to collection:', collection);
      router.push(`/content/${collection}`);
    }
  });
}

// Check if we're on a logged-in page
if (!window.location.pathname.includes('/login')) {
  console.log('[directus-utils] User is logged in, setting up observer');

  // Add button when navigation occurs
  const observer = new MutationObserver(() => {
    if (window.location.pathname.includes('/login')) {
      console.log('[directus-utils] Login page detected, stopping observation');
      observer.disconnect();
      return;
    }
    addCloseButton();
  });

  // Start observing the document with the configured parameters
  observer.observe(document.body, { childList: true, subtree: true });
  console.log('[directus-utils] Observer started');
} else {
  console.log('[directus-utils] Login page detected, not initializing');
}
