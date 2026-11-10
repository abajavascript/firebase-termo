// modal-confirm-dialog
const modalConfirmDialog = document.querySelector('#modal-confirm-dialog');
function confirmDialog(message) {
  return new Promise((resolve) => {
    modalConfirmDialog.querySelector('H4').innerHTML = message;
    modalConfirmDialog.resolve = resolve;
    M.Modal.getInstance(modalConfirmDialog).open();
  });
}

modalConfirmDialog.querySelector('#modal-confirm-dialog-YesBtn').addEventListener('click', (e) => {
  e.preventDefault();
  M.Modal.getInstance(modalConfirmDialog).close();
  modalConfirmDialog.resolve(true);
});

modalConfirmDialog.querySelector('#modal-confirm-dialog-CancelBtn').addEventListener('click', (e) => {
  e.preventDefault();
  M.Modal.getInstance(modalConfirmDialog).close();
  modalConfirmDialog.resolve(false);
});
