/**
 * Custom Dialog System for Differon
 * Provides styled dialogs that match the application's dark theme
 */

class Dialog {
    constructor(options) {
        this.options = {
            title: 'Dialog',
            message: '',
            type: 'info', // info, confirm, yesno, input
            buttons: [],
            icon: null,
            inputOptions: {
                defaultValue: '',
                placeholder: ''
            },
            ...options
        };
        
        this.overlay = null;
        this.dialog = null;
        this.result = null;
        this.resolvePromise = null;
        this.previousFocus = document.activeElement;
        
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleOverlayClick = this.handleOverlayClick.bind(this);
    }
    
    create() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'dialog-overlay';
        this.overlay.addEventListener('click', this.handleOverlayClick);
        
        // Create dialog container
        this.dialog = document.createElement('div');
        this.dialog.className = 'dialog';
        
        // Create header
        const header = document.createElement('div');
        header.className = 'dialog-header';
        
        if (this.options.icon) {
            const icon = document.createElement('img');
            icon.src = this.options.icon;
            icon.className = 'dialog-icon';
            header.appendChild(icon);
        }
        
        const title = document.createElement('h3');
        title.className = 'dialog-title';
        title.textContent = this.options.title;
        header.appendChild(title);
        
        // Create body
        const body = document.createElement('div');
        body.className = 'dialog-body';
        
        const message = document.createElement('p');
        message.className = 'dialog-message';
        message.textContent = this.options.message;
        body.appendChild(message);
        
        // Add input field for input dialogs
        if (this.options.type === 'input') {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'dialog-input';
            input.value = this.options.inputOptions.defaultValue;
            input.placeholder = this.options.inputOptions.placeholder;
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleButtonClick(this.options.buttons[0]);
                }
            });
            body.appendChild(input);
            this.inputElement = input;
        }
        
        // Create footer with buttons
        const footer = document.createElement('div');
        footer.className = 'dialog-footer';
        
        this.options.buttons.forEach((buttonConfig, index) => {
            const button = document.createElement('button');
            button.className = 'dialog-button';
            if (buttonConfig.primary) {
                button.classList.add('dialog-button-primary');
            } else {
                button.classList.add('dialog-button-secondary');
            }
            
            // Add icon if specified
            if (buttonConfig.icon) {
                const icon = document.createElement('img');
                icon.src = buttonConfig.icon;
                button.appendChild(icon);
            }
            
            // Add text
            const text = document.createElement('span');
            text.textContent = buttonConfig.text;
            button.appendChild(text);
            
            button.addEventListener('click', () => this.handleButtonClick(buttonConfig));
            
            // Store reference for focus management
            if (index === 0) {
                this.primaryButton = button;
            }
            
            footer.appendChild(button);
        });
        
        // Assemble dialog
        this.dialog.appendChild(header);
        this.dialog.appendChild(body);
        this.dialog.appendChild(footer);
        this.overlay.appendChild(this.dialog);
        
        // Add styles
        this.addStyles();
        
        // Add to DOM
        document.body.appendChild(this.overlay);
        
        // Add keyboard event listener
        document.addEventListener('keydown', this.handleKeyDown);
    }
    
    handleButtonClick(buttonConfig) {
        this.result = buttonConfig.value;
        if (this.options.type === 'input' && buttonConfig.value === true) {
            this.result = this.inputElement.value;
        }
        this.hide();
    }
    
    handleKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.result = this.options.type === 'input' ? null : false;
            this.hide();
        } else if (e.key === 'Tab') {
            // Focus trap
            const focusableElements = this.dialog.querySelectorAll(
                'button, input, [tabindex]:not([tabindex="-1"])'
            );
            const firstFocusable = focusableElements[0];
            const lastFocusable = focusableElements[focusableElements.length - 1];
            
            if (e.shiftKey && document.activeElement === firstFocusable) {
                e.preventDefault();
                lastFocusable.focus();
            } else if (!e.shiftKey && document.activeElement === lastFocusable) {
                e.preventDefault();
                firstFocusable.focus();
            }
        }
    }
    
    handleOverlayClick(e) {
        if (e.target === this.overlay) {
            this.result = this.options.type === 'input' ? null : false;
            this.hide();
        }
    }
    
    show() {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.create();
            
            // Force reflow before adding visible class
            this.overlay.offsetHeight;
            this.overlay.classList.add('visible');
            
            // Focus management
            setTimeout(() => {
                if (this.options.type === 'input' && this.inputElement) {
                    this.inputElement.focus();
                    this.inputElement.select();
                } else if (this.primaryButton) {
                    this.primaryButton.focus();
                }
            }, 50);
        });
    }
    
    hide() {
        this.overlay.classList.remove('visible');
        
        setTimeout(() => {
            this.destroy();
            if (this.resolvePromise) {
                this.resolvePromise(this.result);
            }
        }, 200); // Match transition duration
    }
    
    destroy() {
        document.removeEventListener('keydown', this.handleKeyDown);
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        
        // Restore focus
        if (this.previousFocus && this.previousFocus.focus) {
            this.previousFocus.focus();
        }
    }
    
    addStyles() {
        if (document.getElementById('dialog-styles')) {
            return;
        }
        
        const style = document.createElement('style');
        style.id = 'dialog-styles';
        style.textContent = `
            .dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                opacity: 0;
                transition: opacity 200ms ease-in-out;
            }
            
            .dialog-overlay.visible {
                opacity: 1;
            }
            
            .dialog {
                background: #2d2d30;
                border: 1px solid #3e3e42;
                border-radius: 6px;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
                min-width: 300px;
                max-width: 500px;
                transform: scale(0.9);
                transition: transform 200ms ease-in-out;
            }
            
            .dialog-overlay.visible .dialog {
                transform: scale(1);
            }
            
            .dialog-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 16px;
                border-bottom: 1px solid #3e3e42;
            }
            
            .dialog-icon {
                width: 20px;
                height: 20px;
                filter: brightness(0) invert(1);
            }
            
            .dialog-title {
                margin: 0;
                font-size: 16px;
                font-weight: 500;
                color: #ffffff;
            }
            
            .dialog-body {
                padding: 16px;
            }
            
            .dialog-message {
                margin: 0 0 12px 0;
                color: #d4d4d4;
                line-height: 1.5;
            }
            
            .dialog-input {
                width: 100%;
                padding: 8px 12px;
                background: #1e1e1e;
                border: 1px solid #3e3e42;
                border-radius: 4px;
                color: #d4d4d4;
                font-size: 13px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                outline: none;
                transition: border-color 200ms;
            }
            
            .dialog-input:focus {
                border-color: #007acc;
            }
            
            .dialog-footer {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                padding: 0 16px 16px 16px;
            }
            
            .dialog-button {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 200ms;
                outline: none;
            }
            
            .dialog-button img {
                width: 16px;
                height: 16px;
                filter: brightness(0) invert(1);
            }
            
            .dialog-button-primary {
                background: #0e639c;
                color: white;
            }
            
            .dialog-button-primary:hover {
                background: #1177bb;
            }
            
            .dialog-button-primary:focus {
                box-shadow: 0 0 0 2px #1177bb;
            }
            
            .dialog-button-secondary {
                background: #3e3e42;
                color: #cccccc;
            }
            
            .dialog-button-secondary:hover {
                background: #4e4e52;
            }
            
            .dialog-button-secondary:focus {
                box-shadow: 0 0 0 2px #4e4e52;
            }
        `;
        document.head.appendChild(style);
    }
}

// Factory functions

async function showInfo(message, title = 'Information') {
    const dialog = new Dialog({
        title,
        message,
        type: 'info',
        icon: 'icons/fluent--info-16-regular.svg',
        buttons: [
            {
                text: 'OK',
                value: true,
                primary: true,
                icon: 'icons/fluent--checkmark-circle-16-regular.svg'
            }
        ]
    });
    
    return dialog.show();
}

async function showConfirm(message, title = 'Confirm') {
    const dialog = new Dialog({
        title,
        message,
        type: 'confirm',
        icon: 'icons/fluent--question-circle-16-regular.svg',
        buttons: [
            {
                text: 'OK',
                value: true,
                primary: true,
                icon: 'icons/fluent--checkmark-circle-16-regular.svg'
            },
            {
                text: 'Cancel',
                value: false,
                primary: false,
                icon: 'icons/fluent--dismiss-circle-16-regular.svg'
            }
        ]
    });
    
    return dialog.show();
}

async function showYesNo(message, title = 'Question') {
    const dialog = new Dialog({
        title,
        message,
        type: 'yesno',
        icon: 'icons/fluent--question-circle-16-regular.svg',
        buttons: [
            {
                text: 'Yes',
                value: true,
                primary: true,
                icon: 'icons/fluent--checkmark-circle-16-regular.svg'
            },
            {
                text: 'No',
                value: false,
                primary: false,
                icon: 'icons/fluent--dismiss-circle-16-regular.svg'
            }
        ]
    });
    
    return dialog.show();
}

async function showInput(message, title = 'Input', defaultValue = '', placeholder = '') {
    const dialog = new Dialog({
        title,
        message,
        type: 'input',
        icon: 'icons/fluent--edit-16-regular.svg',
        inputOptions: {
            defaultValue,
            placeholder
        },
        buttons: [
            {
                text: 'OK',
                value: true,
                primary: true,
                icon: 'icons/fluent--checkmark-circle-16-regular.svg'
            },
            {
                text: 'Cancel',
                value: false,
                primary: false,
                icon: 'icons/fluent--dismiss-circle-16-regular.svg'
            }
        ]
    });
    
    return dialog.show();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { showInfo, showConfirm, showYesNo, showInput };
}