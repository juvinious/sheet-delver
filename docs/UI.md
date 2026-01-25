# Reusable UI Components

SheetDelver provides a set of core UI components to ensure consistency across different system sheets. These components are designed to be system-agnostic and themable via the `SystemAdapter`.

## Notification System (Toast)

A robust toast notification system that supports HTML content (e.g., for dice roll results) and auto-dismissal.

**Path**: `@/components/NotificationSystem`

### Usage

1.  **Initialize Hook**:
    ```tsx
    import { useNotifications, NotificationContainer } from '@/components/NotificationSystem';

    export default function MyPage() {
        const { notifications, addNotification, removeNotification } = useNotifications(5000); // 5s default duration

        return (
            <>
                <button onClick={() => addNotification('Hello!', 'success')}>Notify</button>
                <NotificationContainer notifications={notifications} removeNotification={removeNotification} />
            </>
        );
    }
    ```

2.  **HTML Content**:
    ```tsx
    addNotification('<b>Bold Message</b>', 'info', { html: true });
    ```

## RichTextEditor

A wrapper around Tiptap for editing HTML content (biographies, notes).

**Path**: `@/components/RichTextEditor`

```tsx
<RichTextEditor 
    content={actor.system.notes} 
    onChange={(html) => onUpdate('system.notes', html)} 
/>
```

## ConfirmationModal

A standard modal for destructive actions. Uses React Portal.

**Path**: `@/components/ui/ConfirmationModal`

```tsx
<ConfirmationModal
    isOpen={isOpen}
    onClose={() => setIsOpen(false)}
    onConfirm={handleDelete}
    title="Delete Item?"
    message="Are you sure you want to delete this content?"
    confirmLabel="Delete"
    isDanger={true}
/>
```

## RollDialog

A unified dialog for configuring dice rolls (Ability checks, Attacks, Spells). Supports generic options or system-specific extensions.

**Path**: `@/components/RollDialog`

```tsx
<RollDialog
    isOpen={isOpen}
    onClose={() => setIsOpen(false)}
    onRoll={(options) => onRoll('attack', 'dagger', options)}
    title="Dagger Attack"
    config={{
        modes: ['normal', 'advantage', 'disadvantage'],
        bonuses: ['ability', 'item', 'talent']
    }}
/>
```

## DiceTray

A persistent tray for manual dice rolling. Generally handled by the layout but accessible if needed. Styles can be overridden via `SystemAdapter.componentStyles.diceTray`.

**Path**: `@/components/DiceTray`

```tsx
<DiceTray 
    onSend={(msg) => handleSend(msg)} 
    adapter={currentAdapter} 
/>
```

## GlobalChat

The main chat interface, including the collapsible chat window and dice tray integration. It sits at the layout level usually.

**Path**: `@/components/GlobalChat`

```tsx
<GlobalChat
    messages={messages}
    onSend={handleChatSend}
    adapter={adapter}
    foundryUrl={foundryUrl}
/>
```
