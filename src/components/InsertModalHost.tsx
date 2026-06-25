import { AlertInsertModal } from "./AlertInsertModal";
import { DiagramTemplateModal } from "./DiagramTemplateModal";
import { EmojiInsertModal } from "./EmojiInsertModal";
import { ImageInsertModal } from "./ImageInsertModal";
import { LinkInsertModal } from "./LinkInsertModal";
import { ReferenceInsertModal } from "./ReferenceInsertModal";
import { SymbolsInsertModal } from "./SymbolsInsertModal";
import { TableInsertModal } from "./TableInsertModal";
import type { InsertModalHostProps } from "../hooks/useInsertModals";

export function InsertModalHost({
  alertSelection,
  closeAlert,
  closeDiagram,
  closeEmoji,
  closeImage,
  closeLink,
  closeReference,
  closeSymbols,
  closeTable,
  diagramSelection,
  emojiSelection,
  imageSelection,
  insertAlert,
  insertDiagram,
  insertEmojis,
  insertImage,
  insertLink,
  insertReference,
  insertSymbols,
  insertTable,
  linkSelection,
  referenceSelection,
  symbolsSelection,
  tableOpen,
}: InsertModalHostProps) {
  return (
    <>
      {tableOpen && (
        <TableInsertModal
          onClose={closeTable}
          onInsert={insertTable}
        />
      )}

      {linkSelection && (
        <LinkInsertModal
          initialText={linkSelection.text}
          onClose={closeLink}
          onInsert={insertLink}
        />
      )}

      {imageSelection && (
        <ImageInsertModal
          initialAlt={imageSelection.text}
          onClose={closeImage}
          onInsert={insertImage}
        />
      )}

      {referenceSelection && (
        <ReferenceInsertModal
          initialNumber={referenceSelection.number}
          onClose={closeReference}
          onInsert={insertReference}
        />
      )}

      {symbolsSelection && (
        <SymbolsInsertModal
          onClose={closeSymbols}
          onInsert={insertSymbols}
        />
      )}

      {alertSelection && (
        <AlertInsertModal
          onClose={closeAlert}
          onInsert={insertAlert}
        />
      )}

      {diagramSelection && (
        <DiagramTemplateModal
          onClose={closeDiagram}
          onInsert={insertDiagram}
        />
      )}

      {emojiSelection && (
        <EmojiInsertModal
          onClose={closeEmoji}
          onInsert={insertEmojis}
        />
      )}
    </>
  );
}
