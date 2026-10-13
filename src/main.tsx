import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import {installTV} from './tv';
installTV();
createRoot(document.getElementById('root')!).render(<App/>);
