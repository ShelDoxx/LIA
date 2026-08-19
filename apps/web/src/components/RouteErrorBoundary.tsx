import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="space-y-3 p-6">
        <h2 className="font-serif text-2xl">No pude abrir esta pantalla</h2>
        <p className="text-sm text-ink-soft">{this.state.error.message}</p>
        <Link to="/clientes" className="text-sm text-gold" onClick={() => this.setState({ error: null })}>
          Volver a clientes
        </Link>
      </div>
    );
  }
}
