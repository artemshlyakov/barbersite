document.querySelectorAll('.mobile-menu nav a').forEach((link) => {
  link.addEventListener('click', () => {
    link.closest('details').open = false;
  });
});
