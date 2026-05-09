import { Component, Input, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ToastService } from '../../../services/toast.service';
import { SignupService } from '../../../services/signup.service';
import { PaymentsService } from '../../../services/payments.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent implements OnInit, OnDestroy {
  @Input()
  link1: string = 'Home'
  @Input()
  link5: string = 'Gallery'
  @Input()
  link6: string = 'FAQ'
  @Input()
  link2: string = 'About'
  @Input()
  logoSrc: string =
    'plan.svg'
  @Input()
  action2: string = '/about'
  @Input()
  action5: string = '/faq'
  @Input()
  logoAlt: string = 'Copyright Check Music Logo'
  @Input()
  link3: string = 'Services'
  @Input()
  action1: string = '/'
  @Input()
  link4: string = 'Contact'


  constructor(private toastService: ToastService, private userService: SignupService, private payments: PaymentsService) {}

  ismobile: boolean = false;
  isScrolled: boolean = false;
  isPro: boolean = false;
  private proSub: Subscription | null = null;

  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (typeof window === 'undefined') return;
    this.isScrolled = window.scrollY > 12;
  }

  toggleNavbar() {
    console.log('Hamburger menu clicked'); // Debugging log
    this.ismobile = !this.ismobile;
    console.log('ismobile: ' + this.ismobile); // Debugging log
  }

  closeNavbar() {
    console.log('Close navbar clicked'); // Debugging log
    this.ismobile = false;
  }

  isDarkMode = false;

  toggleDarkMode() {
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }

  isDropdownOpen = false;

  // Toggle dropdown on user icon click
  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  // Close dropdown if clicked outside of it
  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-dropdown')) {
      this.isDropdownOpen = false;
    }
  }

  closeDropdown() {
    this.isDropdownOpen = false;
  }



  ngOnInit(): void {
    this.isAuth();
    this.proSub = this.payments.isPro$.subscribe((v) => (this.isPro = v));
  }

  ngOnDestroy(): void {
    this.proSub?.unsubscribe();
  }

  isLogged: boolean = false;

  isAuth(): boolean {
    this.isLogged = this.userService.isAuth();
    if (this.isLogged) {
      return true;
    }
    return false;
  }

  logOut(): void {
    if(this.isLogged) {
      this.userService.deleteToken();
      this.toastService.showToast('success', 'Logged out successfully');
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    }
  }


}
