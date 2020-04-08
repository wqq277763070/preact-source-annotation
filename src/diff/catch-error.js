import { enqueueRender } from '../component';

/**
 * Find the closest error boundary to a thrown error and call it
 * @param {object} error The thrown value
 * @param {import('../internal').VNode} vnode The vnode that threw
 * the error that was caught (except for unmounting when this parameter
 * is the highest parent that was being unmounted)
 */
//处理渲染虚拟节点时异常情况
export function _catchError(error, vnode) {
	/** @type {import('../internal').Component} */
	let component, hasCaught;
	//不断遍历父组件
	for (; (vnode = vnode._parent); ) {
		//如果有父组件并且该父组件不是异常
		if ((component = vnode._component) && !component._processingException) {
			try {
				//如果组件有静态方法getDerivedStateFromError，将执行结果传给setState
				//component.constructor是组件函数
				if (
					component.constructor &&
					component.constructor.getDerivedStateFromError != null
				) {
					hasCaught = true;
					component.setState(
						component.constructor.getDerivedStateFromError(error)
					);
				}

				//如果设置了componentDidCatch，则执行componentDidCatch
				if (component.componentDidCatch != null) {
					hasCaught = true;
					component.componentDidCatch(error);
				}

				//再去渲染处理error的组件
				if (hasCaught)
					return enqueueRender((component._pendingError = component));
			} catch (e) {
				error = e;
			}
		}
	}
	//如果异常没有处理，则抛出error
	throw error;
}
