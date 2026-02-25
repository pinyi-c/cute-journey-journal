import { Dialog, DialogContent } from '@/components/ui/dialog';

interface Props {
  url: string | null;
  onClose: () => void;
}

export function PhotoPreviewModal({ url, onClose }: Props) {
  return (
    <Dialog open={!!url} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 flex items-center justify-center">
        {url && (
          <img
            src={url}
            alt="Preview"
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
