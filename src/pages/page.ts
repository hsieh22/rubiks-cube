export interface Page {
  el: HTMLElement;
  show(): void;
  hide(): void;
  onKey?(e: KeyboardEvent): void;
  onKeyUp?(e: KeyboardEvent): void;
}
