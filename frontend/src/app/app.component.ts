import { Component, OnInit } from '@angular/core';
import {
  ActivatedRoute,
  ActivationEnd,
  NavigationEnd,
  Router,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { SignupService } from './services/signup.service';
import { PaymentsService } from './services/payments.service';
import { FavoritesService } from './services/favorites.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'music-license-checker';
  hideChrome = false;

  ngOnInit(): void {
    this.userService.isAuth();

    if (typeof window !== 'undefined' && this.userService.isAuth()) {
      this.payments.refreshEntitlement().subscribe();
      this.favorites.promoteLocalToServer().subscribe();
    }

    this.router.events
      .pipe(
        filter(
          (e): e is ActivationEnd =>
            e instanceof ActivationEnd && !!e.snapshot?.routeConfig
        ),
        map((e) => !!e.snapshot.data?.['hideChrome'])
      )
      .subscribe((hide) => (this.hideChrome = hide));

    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        this.hideChrome = this.collectHideChrome(this.route.snapshot);
      });

    this.hideChrome = this.collectHideChrome(this.route.snapshot);
  }

  private collectHideChrome(snapshot: any): boolean {
    let s = snapshot;
    while (s) {
      if (s.data && s.data['hideChrome']) return true;
      s = s.firstChild;
    }
    return false;
  }

  isDarkMode = true;

  toggleDarkMode() {
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }

  constructor(
    private userService: SignupService,
    private router: Router,
    private route: ActivatedRoute,
    private payments: PaymentsService,
    private favorites: FavoritesService
  ) {}
}
