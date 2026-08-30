import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { Pencil, Copy, Move, Trash2, Share2, Info, ExternalLink, FolderOpen, Tag } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { renameDocument, duplicateDocument, copyDocument, moveDocument, deleteDocument, shareDocument } from '@/services/file-operations';
import { FolderPicker } from './folder-picker';

interface FileActionsProps {
  visible: boolean;
  fileName: string;
  documentId: string;
  onClose: () => void;
  onRename?: () => void;
  onCopy?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onInfo?: () => void;
  onOpenWith?: () => void;
  onAddToCollection?: () => void;
  onAddTag?: () => void;
}

export function FileActionsSheet({ visible, fileName, documentId, onClose, onRename, onCopy, onMove, onDelete, onShare, onInfo, onOpenWith, onAddToCollection, onAddTag }: FileActionsProps) {
  const c = useTheme();
  const [showRename, setShowRename] = useState(false);
  const [showMoveCopy, setShowMoveCopy] = useState<'move' | 'copy' | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  const handleRename = async () => {
    if (!inputValue.trim()) return;
    const ok = await renameDocument(documentId, inputValue.trim());
    if (ok) {
      Alert.alert('Renamed', `Document renamed to "${inputValue.trim()}"`);
      setShowRename(false);
      onRename?.();
      onClose();
    } else {
      Alert.alert('Error', 'Failed to rename document.');
    }
  };

  const handleDuplicate = async () => {
    const ok = await duplicateDocument(documentId);
    if (ok) {
      Alert.alert('Duplicated', 'Document duplicated successfully.');
      onCopy?.();
      onClose();
    } else {
      Alert.alert('Error', 'Failed to duplicate document.');
    }
  };

  const handleDelete = async () => {
    const ok = await deleteDocument(documentId);
    if (ok) {
      onDelete?.();
      onClose();
    }
  };

  const handleShare = async () => {
    await shareDocument(documentId);
    onShare?.();
    onClose();
  };

  const handleMoveCopy = async () => {
    if (!folderPath.trim()) return;
    let ok: boolean | string | null;
    if (showMoveCopy === 'move') {
      ok = await moveDocument(documentId, folderPath.trim());
    } else {
      ok = await copyDocument(documentId, folderPath.trim());
    }
    if (ok) {
      Alert.alert('Success', `Document ${showMoveCopy === 'move' ? 'moved' : 'copied'} successfully.`);
      setShowMoveCopy(null);
      setFolderPath('');
      if (showMoveCopy === 'move') onMove?.();
      else onCopy?.();
      onClose();
    } else {
      Alert.alert('Error', `Failed to ${showMoveCopy} document. Check the destination path.`);
    }
  };

  const actions = [
    { icon: Pencil, label: 'Rename', action: () => { setInputValue(fileName); setShowRename(true); } },
    { icon: Copy, label: 'Duplicate', action: handleDuplicate },
    { icon: Move, label: 'Move', action: () => { setShowMoveCopy('move'); setFolderPath(''); } },
    { icon: Copy, label: 'Copy to...', action: () => { setShowMoveCopy('copy'); setFolderPath(''); } },
    { icon: FolderOpen, label: 'Add to Collection', action: () => { onAddToCollection?.(); onClose(); } },
    { icon: Tag, label: 'Add Tag', action: () => { onAddTag?.(); onClose(); } },
    { icon: Trash2, label: 'Delete', action: handleDelete },
    { icon: Share2, label: 'Share', action: handleShare },
    { icon: Info, label: 'Properties', action: () => { onInfo?.(); onClose(); } },
    { icon: ExternalLink, label: 'Open with...', action: () => { onOpenWith?.(); onClose(); } },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          {showRename ? (
            <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 12 }}>Rename Document</Text>
              <TextInput
                value={inputValue}
                onChangeText={setInputValue}
                style={{ backgroundColor: c.background, borderRadius: 12, padding: 14, fontSize: 16, color: c.text, borderWidth: 1, borderColor: c.border, marginBottom: 16 }}
                autoFocus
                placeholder="New name"
                placeholderTextColor={c.textTertiary}
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => setShowRename(false)} style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' }}>
                  <Text style={{ color: c.text, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRename} style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center' }}>
                  <Text style={{ color: '#FFF', fontWeight: '600' }}>Rename</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : showMoveCopy ? (
            <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 12 }}>
                {showMoveCopy === 'move' ? 'Move to...' : 'Copy to...'}
              </Text>
              <TouchableOpacity
                onPress={() => setShowFolderPicker(true)}
                style={{ backgroundColor: c.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <FolderOpen size={18} color={c.primary} />
                <Text style={{ flex: 1, fontSize: 15, color: folderPath ? c.text : c.textTertiary }} numberOfLines={1}>
                  {folderPath || 'Choose destination folder...'}
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => { setShowMoveCopy(null); setFolderPath(''); }} style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' }}>
                  <Text style={{ color: c.text, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleMoveCopy}
                  disabled={!folderPath.trim()}
                  style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', opacity: folderPath.trim() ? 1 : 0.5 }}
                >
                  <Text style={{ color: '#FFF', fontWeight: '600' }}>{showMoveCopy === 'move' ? 'Move' : 'Copy'}</Text>
                </TouchableOpacity>
              </View>
              <FolderPicker
                visible={showFolderPicker}
                onSelect={(path) => { setFolderPath(path); setShowFolderPicker(false); }}
                onCancel={() => setShowFolderPicker(false)}
              />
            </View>
          ) : (
            <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 16 }} numberOfLines={1}>{fileName}</Text>
              {actions.map(({ icon: Icon, label, action }) => (
                <TouchableOpacity
                  key={label}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 }}
                  onPress={action}
                  accessibilityLabel={label}
                  accessibilityRole="button"
                >
                  <Icon size={22} color={c.text} />
                  <Text style={{ fontSize: 16, color: c.text }}>{label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={onClose} style={{ marginTop: 12, padding: 14, backgroundColor: c.border, borderRadius: 12, alignItems: 'center' }} accessibilityLabel="Cancel" accessibilityRole="button">
                <Text style={{ color: c.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
