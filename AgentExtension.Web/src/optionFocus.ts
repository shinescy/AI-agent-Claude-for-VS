// 输入框与转录里那些命令选项框之间的焦点往返。

/** 命令选项框（工具栏）的选择器。 */
export const OPTIONS_SELECTOR = '.command-options';

/** 输入框的选择器。 */
export const COMPOSER_SELECTOR = '.composer-textarea';

/** 把焦点移进**最后一个**命令选项框（最新的那条回复）。 */
export function focusLastCommandOptions(root: ParentNode = document): boolean {
  const groups = root.querySelectorAll<HTMLElement>(OPTIONS_SELECTOR);
  const last = groups[groups.length - 1];

  if (!last)
  {
    return false;
  }

  const target = last.querySelector<HTMLElement>('[tabindex="0"]')
    ?? last.querySelector<HTMLElement>('button');

  if (!target)
  {
    return false;
  }

  target.focus();
  return true;
}

/** 把焦点送回输入框。 */
export function focusComposer(root: ParentNode = document): boolean {
  const element = root.querySelector<HTMLTextAreaElement>(COMPOSER_SELECTOR);

  if (!element)
  {
    return false;
  }

  element.focus();
  return true;
}
