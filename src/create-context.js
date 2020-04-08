import { enqueueRender } from './component';

export let i = 0;

//创建context
//defaultValue只有组件的祖先组件中没有Provider组件才使用这个，不是Provider没有设置value
export function createContext(defaultValue) {
	const ctx = {};

	const context = {
		_id: '__cC' + i++,
		_defaultValue: defaultValue,
		//context消费者
		Consumer(props, context) {
			//把context传给children执行
			return props.children(context);
		},
		//context提供者
		Provider(props) {
			if (!this.getChildContext) {
				const subs = [];
				//在渲染Provider组件时调用
				//这个然后把ctx作为globalContext传递给下级组件
				this.getChildContext = () => {
					ctx[context._id] = this;
					//至于为什么不直接返回context而是返回ctx对象
					//是由于Provider组件的后代组件也可以有Provider组件，context的消费者只取contextType中_id相匹配的
					//见diff/index.js中diff->outer-> let provider = tmp && globalContext[tmp._id];
					return ctx;
				};

				this.shouldComponentUpdate = _props => {
					//当value不相等时
					if (this.props.value !== _props.value) {
						//渲染context消费的组件
						subs.some(c => {
							c.context = _props.value;
							enqueueRender(c);
						});
					}
				};
				//渲染消费content组件时调用
				this.sub = c => {
					//添加到队列中，当value改变时渲染该组件
					subs.push(c);
					let old = c.componentWillUnmount;
					//当组件卸载后从队列中删除，然后执行老的componentWillUnmount
					c.componentWillUnmount = () => {
						subs.splice(subs.indexOf(c), 1);
						old && old.call(c);
					};
				};
			}

			return props.children;
		}
	};
	//给Consumer组件设置contextType
	context.Consumer.contextType = context;

	return context;
}
