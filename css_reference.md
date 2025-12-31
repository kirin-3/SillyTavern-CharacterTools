# SillyTavern CSS Reference for Extensions

## Layout & Flex Utilities

```css
/* Flex containers */
.flex-container        /* Main flex wrapper */
.flexFlowColumn        /* flex-direction: column */
.flexFlowRow           /* flex-direction: row */
.flexWrap              /* flex-wrap: wrap */
.flexNoWrap            /* flex-wrap: nowrap */
.flexnowrap            /* same thing, inconsistent naming */

/* Flex item sizing */
.flex0, .flex1, .flex2, .flex3, .flex4  /* flex: 0-4 */
.flexAuto              /* flex: auto */
.flexGrow              /* flex-grow: 1 */
.flexShrink            /* flex-shrink: 1 */
.flexBasis50p          /* flex-basis: 50% */
.flexBasis25p, .flexBasis30p, .flexBasis48p, .flexBasis100p
.flexBasis200px

/* Alignment */
.alignItemsCenter      /* align-items: center */
.alignitemscenter      /* same, inconsistent */
.alignItemsBaseline
.alignItemsFlexEnd
.alignItemsStart, .alignitemsstart, .alignitemsflexstart
.alignContentCenter
.alignContentFlexStart
.alignSelfStart

/* Justify */
.justifyCenter
.justifyLeft
.justifySpaceBetween
.justifySpaceAround
.justifySpaceEvenly
.justifyContentFlexEnd
.justifyContentFlexStart
.justifyContentSpaceAround
.spaceBetween
.spaceEvenly

/* Gap */
.gap0, .gap3px, .gap5px, .gap10px
.gap10h5v, .gap10h20v
.flexGap2, .flexGap5, .flexGap10
.flexNoGap
```

## Width & Height

```css
/* Width */
.wide100p              /* width: 100% */
.wide50p, .wide30p, .wide25p
.wide50px
.wide100pLess70px      /* calc(100% - 70px) */
.wide10pMinFit
.wideMinContent
.wideMax100px
.width100p, .width100px
.widthFitContent
.widthNatural
.widthUnset
.widthFreeExpand
.maxWidth200px

/* Height */
.height100p
.height32px
.heightFitContent
.heightMinContent
.height100pSpaceEvenly
```

## Margin & Padding

```css
/* Margin */
.margin0, .margin5
.margin0auto           /* margin: 0 auto (centering) */
.marginBot5, .marginBot10
.marginTop5, .marginTop10
.marginTopBot5
.marginLeft5
.margin-bot-10px
.margin-right-10px
.margin-r2, .margin-r5
.m-t-0 through .m-t-5  /* margin-top scale */
.m-b-1 through .m-b-5  /* margin-bottom scale */

/* Padding */
.padding0, .padding5, .padding10
.paddingTopBot5
.paddingLeftRight5
.paddingBottom5px
.li-padding-b-1, .li-padding-b-2, .li-padding-b-5
.li-padding-bot5, .li-padding-bot10
```

## Buttons

```css
/* Primary button class - USE THIS */
.menu_button           /* Standard ST button */
.menu_button_default   /* Default state */

/* Right panel buttons */
.right_menu_button

/* Interactive elements */
.interactable          /* Clickable items, hover states */
.actionable            /* Similar to interactable */

/* Button states */
.disabled
.selected
.active
.toggleOn, .toggleOff
.toggle_enable, .toggle_disable
```

## Form Controls

```css
/* Text inputs - USE THIS */
.text_pole             /* Standard text input styling */

/* Checkboxes */
.checkbox
.checkbox_label        /* Label wrapping checkbox + text */

/* Textareas */
.textarea_compact
.maximized_textarea

/* Special inputs */
.keyprimarytextpole
.keysecondarytextpole
.keyselect
```

## Drawers & Panels

```css
/* Inline drawer pattern - VERY COMMON */
.inline-drawer
.inline-drawer-toggle
.inline-drawer-header
.inline-drawer-header-pointer
.inline-drawer-content
.inline-drawer-maximize

/* Drawer content */
.drawer-content
.drawer25pWidth, .drawer33pWidth

/* Panel behaviors */
.openDrawer
.open                  /* Generic open state */
```

## Range Sliders

```css
/* Range block pattern */
.range-block           /* Container for slider + value */
.range-block-range     /* The slider input */
.range-block-val       /* The number input */
```

## Messages & Chat

```css
/* Message structure */
.mes                   /* Message container */
.mes_block             /* Message content block */
.mes_text              /* Message text content */
.mes_buttons           /* Message action buttons */
.mes_button            /* Individual message button */
.mesAvatarWrapper      /* Avatar container */

/* Message states */
.last_mes              /* Last message in chat */

/* Message extras */
.mes_edit
.mes_timer
.mes_translate
.mes_narrate
.extraMesButtons
.extraMesButtonsHint
.expandMessageActions

/* Swipe controls */
.swipe_left

/* Chat container */
.chatMessage
.chatMessageContainer
```

## Extensions UI

```css
/* Extension blocks */
.extension_block       /* Main extension container */
.extension_container
.extensions_block
.extension_actions
.extension_name
.extension_version
.extension_text_block

/* Extension states */
.extension_enabled
.extension_disabled
.extension_missing

/* Extension settings */
.extensions_info
.extensions_toolbar
.extensions_url_block
```

## Tags

```css
.tag                   /* Tag element */
.tags                  /* Tags container */
.tags_inline           /* Inline tags display */
.tag_name
.tag_controls
.tag_delete
.tag_remove
.tag_as_folder
.tag_folder_indicator
.tags_view
.tag_view_item
.tag_view_name
.tag_view_color_picker
.tag_view_counter
.tagListHint
```

## Characters & Groups

```css
/* Character select */
.character_select
.character_select_container
.character_selected

/* Character card */
.character_name_block
.character_name_block_sub_line
.character_version
.ch_name
.ch_description
.ch_avatar_url
.ch_additional_info
.ch_add_placeholder

/* Avatar */
.avatar
.avatar-container
.avatar_div
.avatars_inline
.avatars_inline_small
.avatars_multiline
.avatar_upload
.avatar_collage
.big-avatars
.rounded-avatars
.square-avatars
.zoomed_avatar
.zoomed_avatar_container
.missing-avatar

/* Groups */
.group_select
.group_select_container
.group_select_block_list
.group_name_block
.group_member
.group_member_icon
.group_member_name
.group_icon
.group_fav_icon
.group_pagination
.group_overlay_mode_select
```

## World Info

```css
.world_entry
.world_entry_edit
.world_entry_form
.world_entry_form_control
.world_entry_form_horizontal
.world_entry_form_radios
.world_entry_thin_controls
.world_info_select_block
.world_popup_expander
.WIEntryContentAndMemo
.WIEntryHeaderControls
.WIEntryTitleAndStatus
.wi-settings
.wi-card-entry
.disabledWIEntry
```

## Popups & Dialogs

```css
.popup
.popup-body
.popup-content
.popup-controls
.popup-input
.popup-inputs
.popup-button-ok
.popup-button-close
.popup-crop-wrap
.popup--animation-fast
.popup--animation-slow
.popup--animation-none

/* Dialog variants */
.large_dialogue_popup
.left_aligned_dialogue_popup
.vertical_scrolling_dialogue_popup
.horizontal_scrolling_dialogue_popup
```

## Visibility & Display

```css
.hidden                /* display: none */
.visible
.disabled
.excluded

/* Show/hide patterns */
.open
.rotated               /* Icon rotation for toggles */

/* Opacity */
.opacity50p
.opacity1
```

## Text & Typography

```css
.textAlignCenter
.monospace
.wordBreakAll

/* Font sizes */
.fontsize60p, .fontsize80p, .fontsize90p, .fontsize120p

/* Text states */
.text_danger           /* Red/error text */
.text_warning          /* Yellow/warning text */
```

## Common Patterns

```css
/* Centering */
.center

/* Borders */
.no-border
.circleborder30px

/* Shadows */
.no-shadow
.noShadows

/* Overflow */
.overflow-hidden
.overflowHidden
.overflowYAuto
.overflowYScroll

/* Backgrounds */
.contain
.cover
.gradient
.grayscale
.no-blur

/* Cursors & Interaction */
.hoverglow
.draggable
.drag-handle
.drag-grabber

/* User select */
.userSelect
```

## Useful IDs (Settings Panels)

```css
#extensions_settings   /* Extensions settings container */
#extensions_settings2
#extensionsMenu

/* Common panels */
#AdvancedFormatting
#Backgrounds
#ContextSettings
#UI-Customization
#UI-Theme-Block

/* Chat elements */
#chat                  /* Main chat container */
#send_form             /* Message input form */

/* World Info */
#world_popup
#world_editor_select
#world_info_search

/* Tags */
#tagList
#tags_div
```

## Icon Patterns (FontAwesome 6)

```css
/* Don't memorize these - look up at fontawesome.com/icons */
/* Common ones you'll use: */
.fa-solid              /* Solid style prefix */
.fa-regular            /* Regular style prefix */

/* Size modifiers */
.fa-xs, .fa-sm, .fa-lg, .fa-xl, .fa-2x

/* Animations */
.fa-spin               /* Spinning icon */
.fa-pulse              /* Pulsing icon */
.fa-beat               /* Beating icon */
.fa-fade               /* Fading icon */
.fa-bounce             /* Bouncing icon */
.fa-flip               /* Flipping icon */
.fa-shake              /* Shaking icon */

/* Rotation */
.fa-rotate-90, .fa-rotate-180, .fa-rotate-270
.fa-flip-horizontal, .fa-flip-vertical, .fa-flip-both
```

## Example: Extension Settings Panel

```html
<div class="my-extension-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>My Extension</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">

      <!-- Checkbox -->
      <label class="checkbox_label">
        <input type="checkbox" id="my_ext_enabled" />
        <span>Enable Feature</span>
      </label>

      <!-- Text input with label -->
      <label for="my_ext_input">Some Setting</label>
      <input type="text" id="my_ext_input" class="text_pole wide100p" />

      <!-- Range slider -->
      <div class="range-block">
        <label for="my_ext_slider">Intensity</label>
        <input type="range" id="my_ext_slider" class="neo-range-slider" min="0" max="100" />
        <input type="number" id="my_ext_slider_val" class="neo-range-input" />
      </div>

      <!-- Flex row of buttons -->
      <div class="flex-container flexFlowRow gap10px">
        <div class="menu_button" id="my_ext_action">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          Do Thing
        </div>
        <div class="menu_button" id="my_ext_reset">
          <i class="fa-solid fa-rotate"></i>
          Reset
        </div>
      </div>

    </div>
  </div>
</div>
```

```css
/* Your extension CSS - MINIMAL */
.my-extension-settings {
  /* Container styles if needed */
}

/* Only override what you MUST */
```

## What NOT To Do

```css
/* DON'T redefine ST's button styles */
.my-button {
  padding: 10px;
  background: blue;
  /* NO - use .menu_button */
}

/* DON'T create custom input styles */
.my-input {
  border: 1px solid gray;
  /* NO - use .text_pole */
}

/* DON'T hardcode colors */
.my-panel {
  background: #1a1a1a;
  /* NO - inherit from ST's theming */
}
```

**TL;DR:**

- `.menu_button` for buttons
- `.text_pole` for inputs
- `.inline-drawer` pattern for collapsible sections
- `.flex-container` + `.flexFlowRow`/`.flexFlowColumn` for layouts
- `.checkbox_label` for checkboxes
- Inspect existing ST UI for anything else

Stop writing CSS. Inherit. Ship.
