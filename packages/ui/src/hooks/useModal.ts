import { useState } from 'react';

export function useModal<ModalTypes extends string>() {
  type AllModalTypes = ModalTypes | `${ModalTypes}Closing` | null;
  const [openedModal, setModalOpen] = useState<AllModalTypes>(null);

  return {
    isOpen(modal: ModalTypes): boolean {
      return openedModal === modal;
    },
    isMounted(modal: ModalTypes): boolean {
      return [modal, `${modal}Closing`].includes(openedModal as any);
    },
    open(modal: ModalTypes): void {
      setModalOpen(modal);
    },
    close(modal: ModalTypes): () => void {
      return () => {
        setModalOpen(`${modal}Closing`);
        setTimeout(() => setModalOpen(null), 300); // fadeout animation duration
      };
    },
  };
}
